// ─────────────────────────────────────────────────────────────────────────────
// src/routes/PublicRoute.tsx
// Redirects authenticated users away from auth pages
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@store/authStore';
import { ROUTES } from '@constants/index';

export interface PublicRouteProps {
  children: ReactNode;
}

/**
 * Route guard for public pages (login, register, etc.).
 * Redirects already-authenticated users to /dashboard.
 */
function PublicRoute({ children }: PublicRouteProps): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingTwoFactor = useAuthStore((s) => s.pendingTwoFactor);

  // If 2FA is pending, allow access to /2fa page but not other public routes
  if (isAuthenticated && !pendingTwoFactor) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
}

PublicRoute.displayName = 'PublicRoute';

export default PublicRoute;
