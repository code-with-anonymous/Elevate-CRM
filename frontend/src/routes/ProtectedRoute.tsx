// ─────────────────────────────────────────────────────────────────────────────
// src/routes/ProtectedRoute.tsx
// Guards routes that require authentication
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@store/authStore';
import { ROUTES } from '@constants/index';
import type { UserRole } from '@/types/auth';

export interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, user must have this specific permission */
  requiredPermission?: string;
  /** If provided, user must have at least this role */
  requiredRole?: UserRole;
  /**
   * When true, allows partially authenticated users (e.g., after login
   * but before email verification or 2FA completion)
   */
  allowPartialAuth?: boolean;
}

/**
 * Route guard for authenticated content.
 *
 * Guard order:
 * 1. Not authenticated → /login (with returnTo)
 * 2. Authenticated but 2FA pending → /2fa
 * 3. Authenticated but email not verified → /verify-email
 * 4. Missing required permission → /access-denied
 */
function ProtectedRoute({
  children,
  requiredPermission,
  requiredRole,
  allowPartialAuth = false,
}: ProtectedRouteProps): React.JSX.Element {
  const location = useLocation();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingTwoFactor = useAuthStore((s) => s.pendingTwoFactor);
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);

  // 1. Not authenticated at all
  if (!isAuthenticated && !pendingTwoFactor) {
    return (
      <Navigate
        to={ROUTES.LOGIN}
        state={{ from: location, returnTo: location.pathname }}
        replace
      />
    );
  }

  if (!allowPartialAuth) {
    // 2. Authenticated but 2FA not yet completed
    if (pendingTwoFactor) {
      return <Navigate to={ROUTES.TWO_FACTOR} replace />;
    }

    // 3. Authenticated but email not verified
    if (user && !user.isEmailVerified) {
      return <Navigate to={ROUTES.VERIFY_EMAIL} replace />;
    }

    // 4. Required permission check
    if (requiredPermission && !hasPermission(requiredPermission)) {
      return (
        <Navigate
          to={ROUTES.ACCESS_DENIED}
          state={{ requiredPermission, requiredRole }}
          replace
        />
      );
    }

    // 5. Required role check
    if (requiredRole && !hasRole(requiredRole)) {
      return (
        <Navigate
          to={ROUTES.ACCESS_DENIED}
          state={{ requiredPermission, requiredRole }}
          replace
        />
      );
    }
  }

  return <>{children}</>;
}

ProtectedRoute.displayName = 'ProtectedRoute';

export default ProtectedRoute;
