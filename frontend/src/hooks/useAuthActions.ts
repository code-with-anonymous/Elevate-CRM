// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useAuthActions.ts
// Auth action hooks using TanStack Query mutations + Zustand store
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import authService from '@services/api/authService';
import { isAuthRejection } from '@services/api/axiosInstance';
import { useAuthStore } from '@store/authStore';
import { ROUTES, STORAGE_KEYS, SESSION_TIMEOUT_MS } from '@constants/index';
import { isCompletedAuth } from '@/types/auth';
import type { LoginPayload } from '@/types/auth';

// ── Idle tracking ─────────────────────────────────────────────────────────────
//
// useSessionTimeout owns the live 30-minute idle timer, but that timer dies with
// the page. These two functions are how the policy survives a reload: the stamp
// is written on activity and read once at boot.
//
// Wrapped because localStorage throws outright in Safari private mode and when a
// browser is set to block site data. A storage failure must degrade to "treat
// the session as expired", never take the app down.

/** Record that the user is active, for the boot-time idle check. */
export function markActivity(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, String(Date.now()));
  } catch {
    // Storage unavailable — restore-after-reload degrades to a login. Fine.
  }
}

/** Forget the activity stamp, so the next boot will not attempt a restore. */
export function clearActivity(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVITY);
  } catch {
    // Nothing to do — see markActivity.
  }
}

/** True when a stamp exists and is younger than the idle timeout. */
function isWithinIdleWindow(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
    if (!raw) return false;

    const last = Number(raw);
    // A hand-edited or corrupted value must not read as "infinitely fresh".
    if (!Number.isFinite(last)) return false;

    return Date.now() - last < SESSION_TIMEOUT_MS;
  } catch {
    return false;
  }
}

// ── useLogin ──────────────────────────────────────────────────────────────────

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPendingTwoFactor = useAuthStore((s) => s.setPendingTwoFactor);
  const navigate = useNavigate();
  const location = useLocation();

  const mutation = useMutation({
    mutationFn: (credentials: LoginPayload) => authService.login(credentials),
    onSuccess: (data, variables) => {
      // Where the user was originally headed. Resolved up front so it survives
      // the 2FA detour — the code screen forwards it on, rather than dumping
      // everyone who uses 2FA on the dashboard.
      //
      // Router state first. ProtectedRoute puts the blocked path there when it
      // redirects; the query param is only ever set by the axios interceptor's
      // hard redirect to /session-expired. Reading the query alone — as this did
      // — meant the state form was never seen and every login landed on the
      // dashboard regardless of where the user was headed.
      const fromState = (location.state as { returnTo?: string } | null)?.returnTo;
      const fromQuery = new URLSearchParams(window.location.search).get('returnTo');
      const returnTo = fromState ?? fromQuery ?? ROUTES.DASHBOARD;

      // `requiresTwoFactor` — the server's spelling. This read `data.requires2FA`,
      // which no response has ever contained, so the branch never fired and a
      // 2FA login fell straight through to the setAuth below, dereferencing a
      // `tokens` that isn't in a 2FA response. Every 2FA user hit a TypeError on
      // the login page and could not get in at all.
      if (data.requiresTwoFactor) {
        // The temp token is the whole point: it is what authorises the verify
        // call on the next screen.
        setPendingTwoFactor(true, data.tempToken);
        navigate(ROUTES.TWO_FACTOR, { replace: true, state: { returnTo } });
        return;
      }

      // Full login success. Narrowed rather than asserted — AuthResponse now
      // types these optional precisely because the 2FA branch omits them, and a
      // malformed response should say so instead of throwing on a property read.
      if (!isCompletedAuth(data)) {
        toast.error('Unexpected response from the server. Please try again.');
        return;
      }

      setAuth(data.user, data.tokens.accessToken, data.organization, data.tokens.expiresIn);

      // Start the idle clock now — the first interaction that would otherwise
      // set it might be minutes away, and a reload before then would find no
      // stamp and bounce a fresh login straight back to /login.
      markActivity();

      // Handle remember me
      if (variables.rememberMe) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true');
      }

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
      clearActivity();
      // The restore that ran at boot no longer describes this page. Logout is
      // client-side (no reload), so without this the resolved promise would
      // short-circuit any later bootstrap in the same page life.
      bootstrapPromise = null;
      localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [clearAuth, navigate]);

  return { logout };
}

// ── useRefreshSession ─────────────────────────────────────────────────────────

export function useRefreshSession() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const refreshSession = useCallback(async (
    opts?: { tolerateColdStart?: boolean }
  ): Promise<boolean> => {
    // Read through getState rather than subscribing. Subscribing to `user` and
    // `organization` made this callback's identity change the moment a refresh
    // succeeded, which re-fired App.tsx's mount effect. It also read a snapshot
    // captured at render; getState is the value as of the call.
    const { user, organization } = useAuthStore.getState();

    try {
      const data = await authService.refreshToken(opts);

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
    } catch (error) {
      // A refresh fails two ways and they mean opposite things. The server
      // answering 401/403 means the cookie is gone, expired or revoked — the
      // user really is signed out. A timeout or 5xx means we learned nothing.
      //
      // This used to clearAuth() on both. Against a free-tier Render instance
      // that had spun down, the cold start (30-60s) outran the 30s timeout on
      // every reload, and a perfectly valid session was destroyed because a
      // container was asleep. Same distinction axiosInstance already draws for
      // its own retries — isAuthRejection is that helper.
      if (isAuthRejection(error)) {
        clearAuth();
        clearActivity();
      }
      return false;
    }
  }, [clearAuth, setAuth]);

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
 * The one in-flight boot restore. Module scope, not a ref: "the session has been
 * restored" is a fact about the page load, not about any one component instance.
 * Reset on logout so a subsequent login can boot cleanly without a reload.
 */
let bootstrapPromise: Promise<void> | null = null;

/**
 * Restores the session on app mount, before any route guard gets to decide.
 *
 * The access token is memory-only, so a reload always starts signed out as far
 * as the store is concerned. The httpOnly refresh cookie is the real source of
 * truth, and the server's refresh response carries `user` and `organization`
 * back with it — so a restore needs nothing from sessionStorage at all.
 *
 * That matters: the previous version only tried when sessionStorage already held
 * a user, so a new tab or a restarted browser never even attempted a refresh and
 * went straight to the login screen with a valid cookie in the jar.
 *
 * The one thing gating the attempt is the idle policy. If the last recorded
 * activity is older than SESSION_TIMEOUT_MS (30 min), we don't try — that is
 * what "sign me out after 30 minutes idle" means across a reload, where
 * useSessionTimeout's in-memory timer no longer exists.
 *
 * Whatever happens, `authStatus` ends at 'ready' — App.tsx renders a spinner
 * until it does, so leaving it 'restoring' would hang the app on a blank screen.
 */
export function useAppBootstrap() {
  const { refreshSession } = useRefreshSession();
  const setLoading = useAuthStore((s) => s.setLoading);
  const setAuthStatus = useAuthStore((s) => s.setAuthStatus);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const bootstrap = useCallback((): Promise<void> => {
    // Dedupe by the in-flight promise, not by store state.
    //
    // StrictMode runs a mount effect twice in the same tick, and the store still
    // reads 'restoring' when the second call arrives — a state check alone lets
    // both through. Two concurrent /auth/refresh calls is not a harmless
    // duplicate: the server rotates and revokes on every refresh
    // (auth.service.js), so the second response invalidates the token the first
    // just installed, and the session dies on the next request.
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
      const { accessToken, authStatus } = useAuthStore.getState();

      // Nothing to restore — a login already happened, or a previous bootstrap
      // settled it.
      if (accessToken || authStatus === 'ready') {
        setAuthStatus('ready');
        return;
      }

      if (!isWithinIdleWindow()) {
        // No stamp, or older than the idle window. Don't spend a network call
        // proving what the policy already decided.
        clearAuth(); // also sets authStatus: 'ready'
        clearActivity();
        return;
      }

      try {
        setLoading(true);
        // Cold-start tolerant: this is the call that decides whether the user is
        // signed in, and there is no later request to recover on if it gives up.
        const restored = await refreshSession({ tolerateColdStart: true });
        // Refresh rotates the cookie, so the session is genuinely alive again —
        // re-stamp so the idle window is measured from now, not from the last
        // click before the reload.
        if (restored) markActivity();
      } finally {
        setLoading(false);
        // In a finally, not after the await: a throw that escapes refreshSession
        // would otherwise strand the app behind App.tsx's loading gate forever.
        setAuthStatus('ready');
      }
    })();

    return bootstrapPromise;
  }, [clearAuth, refreshSession, setAuthStatus, setLoading]);

  return { bootstrap };
}

export default useAuthActions;
