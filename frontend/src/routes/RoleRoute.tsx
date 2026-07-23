// ─────────────────────────────────────────────────────────────────────────────
// src/routes/RoleRoute.tsx
// Extends ProtectedRoute with role-based access control
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '@store/authStore';
import { ROUTES } from '@constants/index';
import type { UserRole } from '@/types/auth';

export interface RoleRouteProps {
  children: ReactNode;
  /** One or more roles that are allowed to access this route */
  allowedRoles: UserRole[];
  /** Optional permission required in addition to role check */
  requiredPermission?: string;
  /** Custom fallback instead of redirect to /access-denied */
  fallback?: ReactNode;
}

/**
 * Role-based route guard.
 * Wraps ProtectedRoute and additionally checks the user's role
 * against the allowedRoles list.
 */
function RoleRoute({
  children,
  allowedRoles,
  requiredPermission,
  fallback,
}: RoleRouteProps): React.JSX.Element {
  const location = useLocation();
  const role = useAuthStore((s) => s.role);

  const isAllowed = allowedRoles.includes(role);

  if (!isAllowed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <Navigate
        to={ROUTES.ACCESS_DENIED}
        state={{ allowedRoles, from: location }}
        replace
      />
    );
  }

  return (
    <ProtectedRoute requiredPermission={requiredPermission}>
      {children}
    </ProtectedRoute>
  );
}

RoleRoute.displayName = 'RoleRoute';

export default RoleRoute;
