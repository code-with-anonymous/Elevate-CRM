// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/axiosInstance.ts
// Configured Axios instance with interceptors, token refresh, retry logic
// ─────────────────────────────────────────────────────────────────────────────
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from 'axios';
import toast from 'react-hot-toast';
import { ERROR_MESSAGES, API_ENDPOINTS, MAX_RETRY_ATTEMPTS, ROUTES } from '@constants/index';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _isRetry?: boolean;
}

interface RefreshTokenResponse {
  tokens: {
    accessToken: string;
    expiresIn: number;
  };
}

// ── Lazy store getter — avoids circular dependency ─────────────────────────────
// We import the store lazily to prevent the circular:
// axiosInstance → authStore → axiosInstance
function getAuthStore(): {
  accessToken: string | null;
  setAuth: (user: never, token: string, org: never, expiresIn?: number) => void;
  clearAuth: () => void;
} | null {
  try {
    // Dynamic import resolved synchronously since Zustand store is a module singleton
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@store/authStore') as {
      useAuthStore: {
        getState: () => {
          accessToken: string | null;
          setAuth: (user: never, token: string, org: never, expiresIn?: number) => void;
          clearAuth: () => void;
        };
      };
    };
    return useAuthStore.getState();
  } catch {
    return null;
  }
}

// ── Refresh token state — prevent concurrent refresh calls ────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

// ── Create Axios instance ──────────────────────────────────────────────────────

const axiosInstance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api',
  withCredentials: true, // send httpOnly refresh cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000, // 30 seconds
});

// ── Request Interceptor — attach access token ─────────────────────────────────

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const store = getAuthStore();
    const token = store?.accessToken;

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// ── Response Interceptor — token refresh + error handling ─────────────────────

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    // ── 401 Unauthorized — attempt silent token refresh ──────────────────────
    if (status === 401 && !originalRequest._isRetry) {
      if (isRefreshing) {
        // Queue request until refresh completes
        return new Promise<AxiosResponse>((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(axiosInstance(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._isRetry = true;
      isRefreshing = true;

      try {
        const response = await axiosInstance.post<RefreshTokenResponse>(
          API_ENDPOINTS.AUTH.REFRESH,
          {},
          { _isRetry: true } as RetryConfig // prevent refresh loop
        );

        // Backend returns { success, message, data: { tokens: { accessToken, expiresIn } } }
        const responseData = response.data as unknown as { data: { tokens: { accessToken: string; expiresIn: number } } };
        const newToken = responseData.data?.tokens?.accessToken ?? (response.data as { tokens?: { accessToken?: string } }).tokens?.accessToken ?? '';
        const expiresIn = responseData.data?.tokens?.expiresIn ?? (response.data as { tokens?: { expiresIn?: number } }).tokens?.expiresIn ?? 900;

        // Update token in store
        const store = getAuthStore();
        if (store) {
          const { useAuthStore } = await import('@store/authStore');
          const state = useAuthStore.getState();
          if (state.user && state.organization) {
            state.setAuth(state.user as never, newToken, state.organization as never, expiresIn);
          }
        }

        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }

        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Refresh failed — clear auth and redirect
        const store = getAuthStore();
        store?.clearAuth();

        // Only redirect if not already on an auth page
        const isAuthPage = window.location.pathname.startsWith('/login') ||
          window.location.pathname.startsWith('/register');

        if (!isAuthPage) {
          window.location.href = `${ROUTES.SESSION_EXPIRED}?returnTo=${encodeURIComponent(window.location.pathname)}`;
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── 429 Too Many Requests ────────────────────────────────────────────────
    if (status === 429) {
      toast.error(ERROR_MESSAGES.RATE_LIMIT, { id: 'rate-limit' });
      return Promise.reject(error);
    }

    // ── 5xx Server Errors ────────────────────────────────────────────────────
    if (status !== undefined && status >= 500) {
      toast.error(ERROR_MESSAGES.SERVER, { id: 'server-error' });
    }

    // ── Network error retry (max 2 retries) ──────────────────────────────────
    if (!error.response && !originalRequest._isRetry) {
      const retryCount = originalRequest._retryCount ?? 0;

      if (retryCount < MAX_RETRY_ATTEMPTS) {
        originalRequest._retryCount = retryCount + 1;

        // Exponential backoff: 500ms, 1000ms
        const delay = 500 * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));

        return axiosInstance(originalRequest);
      }

      toast.error(ERROR_MESSAGES.NETWORK, { id: 'network-error' });
    }

    return Promise.reject(error);
  }
);

// ── Request cancellation helper ────────────────────────────────────────────────

export function createCancelToken(): AbortController {
  return new AbortController();
}

/**
 * Creates a request config with an AbortController signal attached.
 * Usage: const controller = createCancelToken();
 *        axiosInstance.get('/endpoint', withCancel(controller));
 *        controller.abort(); // cancels the request
 */
export function withCancel(
  controller: AbortController,
  config?: AxiosRequestConfig
): AxiosRequestConfig {
  return {
    ...config,
    signal: controller.signal,
  };
}

export default axiosInstance;
