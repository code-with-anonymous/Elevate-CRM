// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/usePermissions.ts
// Fine-grained permission + role checking hooks
//
// These are UX helpers, not security. Every check here is enforced again by the
// route middleware on the server; hiding a control only keeps the interface from
// offering an action that would answer 403.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import { useAuthStore } from '@store/authStore';
import type { UserRole } from '@/types/auth';
import type { Permission } from '@constants/permissions';

export interface UsePermissionsReturn {
  /** Check if user has a single permission */
  can: (permission: Permission) => boolean;
  /** Check if user has ALL specified permissions */
  canAll: (permissions: Permission[]) => boolean;
  /** Check if user has ANY of the specified permissions */
  canAny: (permissions: Permission[]) => boolean;
  /** Check if user's role exactly matches or is higher */
  isRole: (role: UserRole) => boolean;
}

/**
 * Exposes permission/role checking helpers.
 * Built on Zustand selectors for performance.
 *
 * The parameters are typed to the `Permission` union rather than `string`, so a
 * misspelled capability is a compile error instead of a control that silently
 * never renders — which is how a gate that's wrong in the safe direction hides
 * for months without anyone noticing.
 */
export function usePermissions(): UsePermissionsReturn {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);

  const can = useCallback(
    (permission: Permission): boolean => hasPermission(permission),
    [hasPermission]
  );

  const canAll = useCallback(
    (permissions: Permission[]): boolean => permissions.every((p) => hasPermission(p)),
    [hasPermission]
  );

  const canAny = useCallback(
    (permissions: Permission[]): boolean => permissions.some((p) => hasPermission(p)),
    [hasPermission]
  );

  const isRole = useCallback(
    (role: UserRole): boolean => hasRole(role),
    [hasRole]
  );

  return { can, canAll, canAny, isRole };
}
