// ─────────────────────────────────────────────────────────────────────────────
// src/store/authStore.ts
// Zustand auth store — access token in memory, user/org in sessionStorage
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthStore, User, Organization, UserRole } from '@/types/auth';
import { STORAGE_KEYS } from '@constants/index';
import { permissionsForRole } from '@constants/permissions';

// ── Persisted State (sessionStorage) ──────────────────────────────────────────
// Only user + org data are persisted. Access token stays in memory ONLY.

interface PersistedState {
  user: User | null;
  organization: Organization | null;
  permissions: string[];
  role: UserRole | undefined;
}

/**
 * Where the app is in restoring a session on boot.
 *
 * `accessToken` is memory-only, so every page load starts with no token and
 * `isAuthenticated: false` — indistinguishable, to a route guard, from a signed
 * out user. The guards used to act on that immediately and bounce a reload to
 * /login before the silent refresh had even been attempted.
 *
 * `'restoring'` is the missing third state: not authenticated, but don't decide
 * yet. App.tsx holds the router back until this reads `'ready'`.
 *
 * There was a `_hydrated` flag here meant for this job. It was written and never
 * read by anything, which is why the race survived.
 */
export type AuthStatus = 'restoring' | 'ready';

interface AuthStoreInternal extends AuthStore {
  authStatus: AuthStatus;
  setAuthStatus: (status: AuthStatus) => void;
}

// ── Default Role ───────────────────────────────────────────────────────────────
import { UserRole as UserRoleEnum } from '@/types/auth';

const DEFAULT_ROLE = UserRoleEnum.VIEWER;

/**
 * The API sends roles lowercase ('owner') because that's the Mongoose enum;
 * UserRole is uppercase ('OWNER'). The User type claims they're the same, so
 * TypeScript never caught it — but at runtime `roleHierarchy['owner']` is
 * undefined, which made hasRole() return false for everyone including owners.
 * Nothing surfaced it because no route passed `requiredRole` until now.
 *
 * Normalized once, here at the boundary. `user.role` is deliberately left as
 * the server sent it — TeamsPage and friends lowercase it for their own lookups.
 */
function normalizeRole(role: unknown): UserRole {
  const upper = String(role ?? '').toUpperCase();
  return (Object.values(UserRoleEnum) as string[]).includes(upper)
    ? (upper as UserRole)
    : DEFAULT_ROLE;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStoreInternal>()(
  persist(
    (set, get) => ({
      // ── State ────────────────────────────────────────────────────────────────
      user: null,
      organization: null,
      accessToken: null, // in-memory only, NOT persisted
      isAuthenticated: false,
      isLoading: false,
      permissions: [],
      role: DEFAULT_ROLE,
      sessionExpiry: null,
      pendingTwoFactor: false,
      otpDestination: null,

      // Boot begins mid-restore. useAppBootstrap flips this to 'ready' exactly
      // once, in a finally, whatever the outcome — so a thrown refresh can never
      // leave the app stuck behind the loading gate.
      authStatus: 'restoring',

      // ── Actions ───────────────────────────────────────────────────────────────

      /**
       * Set full authenticated state after login/refresh
       */
      setAuth: (user: User, token: string, org: Organization, expiresIn?: number): void => {
        const expiry = expiresIn
          ? Date.now() + expiresIn * 1000
          : null;

        set({
          user,
          organization: org,
          accessToken: token, // memory only
          isAuthenticated: true,
          isLoading: false,
          authStatus: 'ready',
          // `?? []` rather than trusting the field: an older backend, or the
          // Google login path, can omit it, and `undefined.includes` in
          // hasPermission would take the whole app down.
          permissions: user.permissions ?? [],
          role: normalizeRole(user.role),
          sessionExpiry: expiry,
          pendingTwoFactor: false,
          otpDestination: null,
        });
      },

      /**
       * Clear all auth state — called on logout or refresh failure
       */
      clearAuth: (): void => {
        set({
          user: null,
          organization: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          permissions: [],
          role: DEFAULT_ROLE,
          sessionExpiry: null,
          pendingTwoFactor: false,
          otpDestination: null,
          // Releases the loading gate. A cleared session is a decided one — the
          // guards should redirect to /login now, not keep showing a spinner.
          authStatus: 'ready',
        });
      },

      /**
       * Partially update user profile without full re-auth
       */
      updateUser: (partial: Partial<User>): void => {
        const current = get().user;
        if (!current) return;

        const updated = { ...current, ...partial };
        set({
          user: updated,
          // Update permissions/role if they changed
          ...(partial.permissions !== undefined && { permissions: partial.permissions }),
          ...(partial.role !== undefined && { role: normalizeRole(partial.role) }),
        });
      },

      /**
       * Update permissions separately (e.g., after role change)
       */
      setPermissions: (permissions: string[]): void => {
        set({ permissions });
      },

      /**
       * Check if user has a specific permission.
       *
       * `permissions` comes from the server. When it's empty we fall back to
       * what the role grants rather than answering false: an empty list used to
       * mean every `can()` check failed, which would hide every gated control
       * from an owner. Sessions started before the server began sending derived
       * permissions have exactly that empty array persisted.
       */
      hasPermission: (permission: string): boolean => {
        const { permissions, role } = get();
        if (permissions.length > 0) return permissions.includes(permission);
        return (permissionsForRole(role) as readonly string[]).includes(permission);
      },

      /**
       * Check if user has a specific role
       * Hierarchy: OWNER > ADMIN > MANAGER > MEMBER > VIEWER
       */
      hasRole: (role: UserRole): boolean => {
        const roleHierarchy: Record<UserRole, number> = {
          [UserRoleEnum.OWNER]: 5,
          [UserRoleEnum.ADMIN]: 4,
          [UserRoleEnum.MANAGER]: 3,
          [UserRoleEnum.MEMBER]: 2,
          [UserRoleEnum.VIEWER]: 1,
        };
        const currentRoleLevel = roleHierarchy[get().role];
        const requiredRoleLevel = roleHierarchy[role];
        return currentRoleLevel >= requiredRoleLevel;
      },

      /**
       * Set pending 2FA state (login initiated but 2FA not yet verified)
       */
      setPendingTwoFactor: (pending: boolean, destination?: string): void => {
        set({
          pendingTwoFactor: pending,
          otpDestination: destination ?? null,
        });
      },

      /**
       * Toggle loading state
       */
      setLoading: (loading: boolean): void => {
        set({ isLoading: loading });
      },

      setAuthStatus: (status: AuthStatus): void => {
        set({ authStatus: status });
      },
    }),
    {
      name: STORAGE_KEYS.USER,
      storage: createJSONStorage(() => sessionStorage),

      // Only persist user, org, permissions, role
      // accessToken is NEVER persisted
      partialize: (state): PersistedState => ({
        user: state.user,
        organization: state.organization,
        permissions: state.permissions,
        role: state.role,
      }),

      onRehydrateStorage: () => (state) => {
        if (state) {
          // User data survived the reload but the access token did not — it was
          // never persisted. isAuthenticated must follow the token, not the
          // user, or a guard would wave through a session with nothing to
          // authenticate its requests.
          //
          // `authStatus` stays 'restoring' (its initial value) so the guards
          // don't act on that `false` until useAppBootstrap has had its turn.
          if (state.user && !state.accessToken) {
            state.isAuthenticated = false;
          }
        }
      },
    }
  )
);

// ── Selectors (for performance-optimized subscriptions) ───────────────────────

export const selectUser = (state: AuthStoreInternal): User | null => state.user;
export const selectOrganization = (state: AuthStoreInternal): Organization | null => state.organization;
export const selectIsAuthenticated = (state: AuthStoreInternal): boolean => state.isAuthenticated;
export const selectIsLoading = (state: AuthStoreInternal): boolean => state.isLoading;
export const selectPermissions = (state: AuthStoreInternal): string[] => state.permissions;
export const selectRole = (state: AuthStoreInternal): UserRole => state.role;
export const selectAccessToken = (state: AuthStoreInternal): string | null => state.accessToken;
export const selectPendingTwoFactor = (state: AuthStoreInternal): boolean => state.pendingTwoFactor;
export const selectOtpDestination = (state: AuthStoreInternal): string | null => state.otpDestination;
export const selectSessionExpiry = (state: AuthStoreInternal): number | null => state.sessionExpiry;
export const selectAuthStatus = (state: AuthStoreInternal): AuthStatus => state.authStatus;
