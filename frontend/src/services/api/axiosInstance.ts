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
import { API_BASE_URL, API_ORIGIN } from './apiBaseUrl';
import { useAuthStore } from '@store/authStore';

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

// ── Store access ───────────────────────────────────────────────────────────────
//
// This was a `require('@store/authStore')` inside a try/catch, on the theory that
// a static import would create the cycle axiosInstance → authStore →
// axiosInstance. There is no such cycle: authStore imports zustand, the auth
// types, and the constants — never axios.
//
// The cost of that shim was total. `require` does not exist in a browser ESM
// bundle, so every call threw ReferenceError, the bare catch swallowed it, and
// getAuthStore() returned null forever. The request interceptor below therefore
// never attached an Authorization header to ANY request: every authenticated
// call 401'd and paid a full refresh round-trip before succeeding, and
// clearAuth() on a rejected refresh was a no-op.
//
// A plain import. The store is a module singleton, so getState() is always the
// live state.

// ── Transient vs. terminal failures ───────────────────────────────────────────
//
// THE distinction this file got wrong. A refresh call can fail two ways and they
// mean opposite things:
//
//   TERMINAL  — the server answered 401/403. The refresh cookie is missing,
//               expired, or revoked. The user really is signed out.
//   TRANSIENT — timeout, DNS failure, connection refused, 5xx. We learned
//               nothing about the session; the server just isn't answering.
//
// Treating transient as terminal is what makes a sleeping Render instance look
// like broken auth: cold start > 30s → refresh times out → clearAuth() →
// bounced to /session-expired, with a perfectly valid cookie still in the jar.

/** True only when the SERVER rejected us. Network noise is not an auth answer. */
export function isAuthRejection(error: unknown): boolean {
  const status = (error as AxiosError)?.response?.status;
  return status === 401 || status === 403;
}

/** Timeout, offline, DNS, connection refused — no response ever arrived. */
function isTransientFailure(error: unknown): boolean {
  const err = error as AxiosError;
  if (err?.response) return err.response.status >= 500;
  return true;
}

// A cold container has to boot Node, connect to Atlas, and answer — routinely
// 30-60s on Render's free tier. The refresh call gates the whole session, so it
// gets a longer budget than a normal request and two extra attempts.
const REFRESH_TIMEOUT_MS = 45_000;
const REFRESH_MAX_ATTEMPTS = 3;
const REFRESH_BACKOFF_MS = [0, 2_000, 5_000];

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
  baseURL: API_BASE_URL, // validated at load — see ./apiBaseUrl
  withCredentials: true, // send httpOnly refresh cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000, // 30 seconds
});

// ── Refresh with cold-start tolerance ─────────────────────────────────────────

/**
 * POST /auth/refresh, retrying only on transient failures.
 *
 * The retry exists for one specific scenario: a Render free-tier instance that
 * spun down after 15 minutes idle. The first attempt times out while the
 * container boots; by attempt two or three it's answering.
 *
 * A 401/403 aborts immediately — retrying a rejected token just delays the
 * inevitable sign-out by seven seconds.
 */
export async function refreshWithRetry(): Promise<AxiosResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < REFRESH_MAX_ATTEMPTS; attempt++) {
    if (REFRESH_BACKOFF_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_BACKOFF_MS[attempt]));
    }

    try {
      const response = await axiosInstance.post<RefreshTokenResponse>(
        API_ENDPOINTS.AUTH.REFRESH,
        {},
        {
          // `_isRetry` keeps this call out of the 401 branch, so a failing
          // refresh can never trigger another refresh.
          _isRetry: true,
          timeout: REFRESH_TIMEOUT_MS,
        } as RetryConfig
      );
      // The server answered — clear the "waking up" notice if we showed one.
      toast.dismiss('api-cold-start');
      return response;
    } catch (error) {
      lastError = error;
      if (!isTransientFailure(error)) throw error;

      // Tell the user why the app is hanging, once, on the first stall. Without
      // this a cold start is 45 seconds of nothing.
      if (attempt === 0) {
        toast.loading('Waking up the server…', { id: 'api-cold-start', duration: 20_000 });
      }
    }
  }

  toast.dismiss('api-cold-start');
  throw lastError;
}

/**
 * Fire-and-forget ping so the container starts booting while the user is still
 * reading the login screen, instead of on their first real request.
 *
 * Deliberately NOT on `axiosInstance`: /health sits outside /api, needs no
 * credentials, and must never touch the auth interceptors.
 */
export function warmUpApi(): void {
  const healthUrl = `${API_ORIGIN}/health`;

  // Errors are meaningless here — this is a nudge, not a check.
  void fetch(healthUrl, { method: 'GET', mode: 'cors' }).catch(() => {});
}

// ── Request Interceptor — attach access token ─────────────────────────────────

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const { accessToken, tempToken } = useAuthStore.getState();

    // Fall back to the 2FA temp token when there is no real one. Between the
    // password and the code there IS no access token, so without this the
    // /auth/verify-otp call goes out unauthenticated and 401s — the 2FA page
    // renders but cannot submit. The server only honours this token on that one
    // endpoint (verifyPendingToken), so a wider fallback is safe.
    const token = accessToken ?? tempToken;

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
        const response = await refreshWithRetry();

        // Backend returns { success, message, data: { tokens: { accessToken, expiresIn } } }
        const responseData = response.data as unknown as { data: { tokens: { accessToken: string; expiresIn: number } } };
        const newToken = responseData.data?.tokens?.accessToken ?? (response.data as { tokens?: { accessToken?: string } }).tokens?.accessToken ?? '';
        const expiresIn = responseData.data?.tokens?.expiresIn ?? (response.data as { tokens?: { expiresIn?: number } }).tokens?.expiresIn ?? 900;

        // Update token in store
        const state = useAuthStore.getState();
        if (state.user && state.organization) {
          state.setAuth(state.user, newToken, state.organization, expiresIn);
        }

        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }

        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // ── The fix ──────────────────────────────────────────────────────────
        // Only tear down the session when the SERVER said no. If we simply
        // couldn't reach it, the cookie is still valid and the next request
        // will try again — signing the user out here would throw away a working
        // session because a container was asleep.
        if (!isAuthRejection(refreshError)) {
          toast.error(
            'Can’t reach the server right now. Your session is still active — try again in a moment.',
            { id: 'api-unreachable', duration: 6000 }
          );
          return Promise.reject(refreshError);
        }

        useAuthStore.getState().clearAuth();

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
