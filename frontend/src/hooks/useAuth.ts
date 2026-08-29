// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useAuth.ts
// Convenient selectors wrapping the Zustand auth store
// ─────────────────────────────────────────────────────────────────────────────
import { useAuthStore } from '@store/authStore';
import type { User, Organization, UserRole } from '@/types/auth';

export interface UseAuthReturn {
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole;
  permissions: string[];
  pendingTwoFactor: boolean;
  sessionExpiry: number | null;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
}

/**
 * Hook to access auth state with convenient selectors.
 * Each selector is individually subscribed for performance.
 */
export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const role = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const pendingTwoFactor = useAuthStore((s) => s.pendingTwoFactor);
  const sessionExpiry = useAuthStore((s) => s.sessionExpiry);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);

  return {
    user,
    organization,
    isAuthenticated,
    isLoading,
    role,
    permissions,
    pendingTwoFactor,
    sessionExpiry,
    hasPermission,
    hasRole,
  };
}
