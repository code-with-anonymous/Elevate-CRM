// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/usePermissions.ts
// Fine-grained permission + role checking hooks
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import { useAuthStore } from '@store/authStore';
import type { UserRole } from '@/types/auth';

export interface UsePermissionsReturn {
  /** Check if user has a single permission */
  can: (permission: string) => boolean;
  /** Check if user has ALL specified permissions */
  canAll: (permissions: string[]) => boolean;
  /** Check if user has ANY of the specified permissions */
  canAny: (permissions: string[]) => boolean;
  /** Check if user's role exactly matches or is higher */
  isRole: (role: UserRole) => boolean;
}

/**
 * Exposes permission/role checking helpers.
 * Built on Zustand selectors for performance.
 */
export function usePermissions(): UsePermissionsReturn {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);

  const can = useCallback(
    (permission: string): boolean => hasPermission(permission),
    [hasPermission]
  );

  const canAll = useCallback(
    (permissions: string[]): boolean => permissions.every((p) => hasPermission(p)),
    [hasPermission]
  );

  const canAny = useCallback(
    (permissions: string[]): boolean => permissions.some((p) => hasPermission(p)),
    [hasPermission]
  );

  const isRole = useCallback(
    (role: UserRole): boolean => hasRole(role),
    [hasRole]
  );

  return { can, canAll, canAny, isRole };
}
