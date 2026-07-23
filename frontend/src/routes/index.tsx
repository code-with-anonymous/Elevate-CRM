// ─────────────────────────────────────────────────────────────────────────────
// src/routes/index.tsx
// Application router — React Router v7 createBrowserRouter
// All pages are lazy-loaded with React.lazy + Suspense
// ─────────────────────────────────────────────────────────────────────────────
import { lazy, Suspense, type ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { ROUTES } from '@constants/index';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';

// ── Global Loading Fallback ────────────────────────────────────────────────────

function PageLoader(): React.JSX.Element {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

// ── Lazy Page Imports — Auth ───────────────────────────────────────────────────

const LoginPage = lazy(() => import('@pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@pages/auth/VerifyEmailPage'));
const OtpPage = lazy(() => import('@pages/auth/OtpPage'));
const TwoFactorPage = lazy(() => import('@pages/auth/TwoFactorPage'));
const AcceptInvitePage = lazy(() => import('@pages/auth/AcceptInvitePage'));
const ChangePasswordPage = lazy(() => import('@pages/auth/ChangePasswordPage'));
const SessionExpiredPage = lazy(() => import('@pages/auth/SessionExpiredPage'));
const UnauthorizedPage = lazy(() => import('@pages/auth/UnauthorizedPage'));
const AccessDeniedPage = lazy(() => import('@pages/auth/AccessDeniedPage'));
const NotFoundPage = lazy(() => import('@pages/auth/NotFoundPage'));

// ── Lazy Page Imports — App ────────────────────────────────────────────────────

const DashboardPage = lazy(() => import('@pages/dashboard/DashboardPage'));
const DashboardLayout = lazy(() => import('@components/layout/DashboardLayout'));

// ── Suspense Wrapper ──────────────────────────────────────────────────────────

function Lazy({ children }: { children: ReactNode }): React.JSX.Element {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// ── Route Tree ────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // ── Root redirect ──────────────────────────────────────────────────────────
  {
    path: ROUTES.HOME,
    element: <Navigate to={ROUTES.DASHBOARD} replace />,
  },

  // ── Public routes — redirect to /dashboard if authenticated ───────────────
  {
    path: ROUTES.LOGIN,
    element: (
      <Lazy>
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      </Lazy>
    ),
  },
  {
    path: ROUTES.REGISTER,
    element: (
      <Lazy>
        <PublicRoute>
          <RegisterPage />
        </PublicRoute>
      </Lazy>
    ),
  },
  {
    path: ROUTES.FORGOT_PASSWORD,
    element: (
      <Lazy>
        <PublicRoute>
          <ForgotPasswordPage />
        </PublicRoute>
      </Lazy>
    ),
  },
  {
    path: ROUTES.RESET_PASSWORD,
    element: (
      <Lazy>
        <PublicRoute>
          <ResetPasswordPage />
        </PublicRoute>
      </Lazy>
    ),
  },
  {
    path: '/invite/:token',
    element: (
      <Lazy>
        <PublicRoute>
          <AcceptInvitePage />
        </PublicRoute>
      </Lazy>
    ),
  },

  // ── Partial auth routes — allow pending 2FA / unverified email ────────────
  {
    path: ROUTES.VERIFY_EMAIL,
    element: (
      <Lazy>
        <VerifyEmailPage />
      </Lazy>
    ),
  },
  {
    path: ROUTES.VERIFY_OTP,
    element: (
      <Lazy>
        <ProtectedRoute allowPartialAuth>
          <OtpPage />
        </ProtectedRoute>
      </Lazy>
    ),
  },
  {
    path: ROUTES.TWO_FACTOR,
    element: (
      <Lazy>
        <ProtectedRoute allowPartialAuth>
          <TwoFactorPage />
        </ProtectedRoute>
      </Lazy>
    ),
  },

  // ── Error / Status pages ───────────────────────────────────────────────────
  {
    path: ROUTES.SESSION_EXPIRED,
    element: (
      <Lazy>
        <SessionExpiredPage />
      </Lazy>
    ),
  },
  {
    path: ROUTES.UNAUTHORIZED,
    element: (
      <Lazy>
        <UnauthorizedPage />
      </Lazy>
    ),
  },
  {
    path: ROUTES.ACCESS_DENIED,
    element: (
      <Lazy>
        <AccessDeniedPage />
      </Lazy>
    ),
  },

  // ── Protected app routes ───────────────────────────────────────────────────
  {
    path: ROUTES.DASHBOARD,
    element: (
      <Lazy>
        <ProtectedRoute>
          <DashboardLayout>
            <Outlet />
          </DashboardLayout>
        </ProtectedRoute>
      </Lazy>
    ),
    children: [
      {
        index: true,
        element: (
          <Lazy>
            <DashboardPage />
          </Lazy>
        ),
      },
    ],
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  {
    path: ROUTES.SETTINGS.SECURITY,
    element: (
      <Lazy>
        <ProtectedRoute>
          <ChangePasswordPage />
        </ProtectedRoute>
      </Lazy>
    ),
  },

  // ── 404 Catch-all ──────────────────────────────────────────────────────────
  {
    path: '*',
    element: (
      <Lazy>
        <NotFoundPage />
      </Lazy>
    ),
  },
]);

export default router;
