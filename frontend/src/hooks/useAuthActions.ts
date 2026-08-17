// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useAuthActions.ts
// Auth action hooks using TanStack Query mutations + Zustand store
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import authService from '@services/api/authService';
import { useAuthStore } from '@store/authStore';
import { ROUTES, STORAGE_KEYS } from '@constants/index';
import type { LoginPayload } from '@/types/auth';

// ── useLogin ──────────────────────────────────────────────────────────────────

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPendingTwoFactor = useAuthStore((s) => s.setPendingTwoFactor);
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (credentials: LoginPayload) => authService.login(credentials),
    onSuccess: (data, variables) => {
      if (data.requires2FA) {
        // 2FA required — store pending state + redirect
        setPendingTwoFactor(true, data.otpDestination);
        navigate(ROUTES.TWO_FACTOR, { replace: true });
        return;
      }

      // Full login success
      setAuth(data.user, data.tokens.accessToken, data.organization, data.tokens.expiresIn);

      // Handle remember me
      if (variables.rememberMe) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true');
      }

      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo') ?? ROUTES.DASHBOARD;
      navigate(returnTo, { replace: true });
    },
  });

  return mutation;
}

// ── useLogout ─────────────────────────────────────────────────────────────────

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Ignore errors — clear local state regardless
    } finally {
      clearAuth();
      localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [clearAuth, navigate]);

  return { logout };
}

// ── useRefreshSession ─────────────────────────────────────────────────────────

export function useRefreshSession() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const data = await authService.refreshToken();

      // Prefer the server's copy. This used to unconditionally re-apply the
      // `user` held in the store — which on a page reload came from
      // sessionStorage — so the role the UI gated on was whatever was persisted
      // when the session started, not what the server believes now. A role
      // changed by an admin never reached the interface, and hand-editing
      // sessionStorage unlocked gated controls (the requests still 403'd).
      //
      // The fallback covers a backend older than the change that added these
      // fields; it is the previous behaviour, kept only so a version skew
      // degrades to a stale role rather than a logout.
      const nextUser = data.user ?? user;
      const nextOrg = data.organization ?? organization;

      if (nextUser && nextOrg) {
        setAuth(nextUser, data.tokens.accessToken, nextOrg, data.tokens.expiresIn);
        return true;
      }
      return false;
    } catch {
      clearAuth();
      return false;
    }
  }, [clearAuth, organization, setAuth, user]);

  return { refreshSession };
}

// ── useAuthActions (composite hook) ──────────────────────────────────────────

export interface UseAuthActionsReturn {
  login: ReturnType<typeof useLogin>;
  logout: ReturnType<typeof useLogout>['logout'];
  refreshSession: ReturnType<typeof useRefreshSession>['refreshSession'];
}

/**
 * Composite hook that exposes all auth actions.
 * Use the individual hooks above when you need fine-grained control.
 */
export function useAuthActions(): UseAuthActionsReturn {
  const login = useLogin();
  const { logout } = useLogout();
  const { refreshSession } = useRefreshSession();

  return { login, logout, refreshSession };
}

// ── useAppBootstrap ────────────────────────────────────────────────────────────

/**
 * Called once on app mount.
 * If sessionStorage has user data but no access token (new tab / page reload),
 * attempt a silent token refresh before rendering protected content.
 */
export function useAppBootstrap() {
  const { refreshSession } = useRefreshSession();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setLoading = useAuthStore((s) => s.setLoading);

  const bootstrap = useCallback(async (): Promise<void> => {
    // User data persisted but token lost (page reload) → silently refresh
    if (user && !accessToken) {
      setLoading(true);
      await refreshSession();
      setLoading(false);
    }
  }, [user, accessToken, setLoading, refreshSession]);

  return { bootstrap };
}

export default useAuthActions;
