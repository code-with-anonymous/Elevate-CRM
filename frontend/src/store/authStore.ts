// ─────────────────────────────────────────────────────────────────────────────
// src/store/authStore.ts
// Zustand auth store — access token in memory, user/org in sessionStorage
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthStore, User, Organization, UserRole } from '@/types/auth';
import { STORAGE_KEYS } from '@constants/index';

// ── Persisted State (sessionStorage) ──────────────────────────────────────────
// Only user + org data are persisted. Access token stays in memory ONLY.

interface PersistedState {
  user: User | null;
  organization: Organization | null;
  permissions: string[];
  role: UserRole | undefined;
}

interface AuthStoreInternal extends AuthStore {
  _hydrated: boolean;
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
          permissions: user.permissions,
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
       * Check if user has a specific permission
       */
      hasPermission: (permission: string): boolean => {
        return get().permissions.includes(permission);
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

      _hydrated: false,
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
          // Mark as hydrated
          state._hydrated = true;

          // If we have user data but no token (new tab / page reload)
          // the app will need to silently refresh on mount
          if (state.user && !state.accessToken) {
            // isAuthenticated stays false until token is refreshed
            // The router/app bootstrap should attempt refreshToken() on mount
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
