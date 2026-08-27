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
import RoleRoute from './RoleRoute';
import PageLoader from '@components/common/PageLoader';
import { UserRole } from '@/types/auth';

// ── Lazy Page Imports — Auth ───────────────────────────────────────────────────

const LoginPage = lazy(() => import('@pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@pages/auth/VerifyEmailPage'));
const OtpPage = lazy(() => import('@pages/auth/OtpPage'));
const TwoFactorPage = lazy(() => import('@pages/auth/TwoFactorPage'));
const AcceptInvitePage = lazy(() => import('@pages/auth/AcceptInvitePage'));
// ChangePasswordPage is now ORPHANED. It used to be mounted at
// /settings/security; that path is the Security tab now, and password change
// lives in the Profile tab. The file is left on disk rather than deleted — that
// call is yours, flagged for the Step 16 sweep.
const SessionExpiredPage = lazy(() => import('@pages/auth/SessionExpiredPage'));
const UnauthorizedPage = lazy(() => import('@pages/auth/UnauthorizedPage'));
const AccessDeniedPage = lazy(() => import('@pages/auth/AccessDeniedPage'));
const NotFoundPage = lazy(() => import('@pages/auth/NotFoundPage'));
const TeamsPage = lazy(() => import('@pages/teams/TeamsPage')); 

// ── Lazy Page Imports — App ────────────────────────────────────────────────────

const DashboardPage   = lazy(() => import('@pages/dashboard/DashboardPage'));
const LeadsPage       = lazy(() => import('@pages/leads/LeadsPage'));
const LeadDetailPage  = lazy(() => import('@pages/leads/LeadDetailPage'));
const PipelinePage    = lazy(() => import('@pages/pipeline/PipelinePage'));
const ContactsPage    = lazy(() => import('@pages/contacts/ContactsPage'));
const TasksPage       = lazy(() => import('@pages/tasks/TasksPage'));
const CalendarPage    = lazy(() => import('@pages/calendar/CalendarPage'));
const ReportsPage     = lazy(() => import('@pages/reports/ReportsPage'));

// ── Settings ───────────────────────────────────────────────────────────────────
const SettingsLayout       = lazy(() => import('@pages/settings/SettingsLayout'));
const ProfileSettings      = lazy(() => import('@pages/settings/ProfileSettings'));
const OrganizationSettings = lazy(() => import('@pages/settings/OrganizationSettings'));
const TeamSettings         = lazy(() => import('@pages/settings/TeamSettings'));
const SecuritySettings     = lazy(() => import('@pages/settings/SecuritySettings'));
const NotificationSettings = lazy(() => import('@pages/settings/NotificationSettings'));
const ActivityLogPage      = lazy(() => import('@pages/activity/ActivityLogPage'));
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

  // ── Protected App Routes (Inside Dashboard Layout) ─────────────────────────
  {
    path: '/',
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
        path: 'dashboard',
        element: (
          <Lazy>
            <DashboardPage />
          </Lazy>
        ),
      },
      {
        path: 'leads',
        element: (
          <Lazy>
            <LeadsPage />
          </Lazy>
        ),
      },
      {
        path: 'leads/:id',
        element: (
          <Lazy>
            <LeadDetailPage />
          </Lazy>
        ),
      },
      {
        path: 'pipeline',
        element: (
          <Lazy>
            <PipelinePage />
          </Lazy>
        ),
      },
      {
        path: 'contacts',
        element: (
          <Lazy>
            <ContactsPage />
          </Lazy>
        ),
      },
      {
        path: 'tasks',
        element: (
          <Lazy>
            <TasksPage />
          </Lazy>
        ),
      },
      {
        path: 'calendar',
        element: (
          <Lazy>
            <CalendarPage />
          </Lazy>
        ),
      },
      {
        // No RoleRoute: the feed only surfaces events about records the user can
        // already read, so gating it would hide a summary of visible data.
        path: 'activity',
        element: (
          <Lazy>
            <ActivityLogPage />
          </Lazy>
        ),
      },
      {
        // Mirrors requireMinRole('manager') on /api/reports/*. The client guard
        // is UX — it shows Access Denied instead of four failed requests — the
        // server middleware is the actual control.
        path: 'reports',
        element: (
          <Lazy>
            <RoleRoute allowedRoles={[UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER]}>
              <ReportsPage />
            </RoleRoute>
          </Lazy>
        ),
      },
      {
        path: 'dashboard/teams',
        element: (
          <Lazy>
            <TeamsPage />
          </Lazy>
        ),
      },

      // ── Settings ─────────────────────────────────────────────────────────
      // Nested inside DashboardLayout so the sidebar and top bar stay put —
      // the old /settings/security route sat OUTSIDE it and rendered a bare
      // page with no navigation.
      //
      // Each tab is its own path, so it's linkable and reload-safe. Bare
      // /settings redirects to the one tab everybody can reach.
      {
        path: 'settings',
        element: (
          <Lazy>
            <SettingsLayout />
          </Lazy>
        ),
        children: [
          { index: true, element: <Navigate to={ROUTES.SETTINGS.PROFILE} replace /> },
          {
            path: 'profile',
            element: (
              <Lazy>
                <ProfileSettings />
              </Lazy>
            ),
          },
          {
            // Mirrors requireRole('owner','admin') on PATCH
            // /api/organizations/current. SettingsLayout also hides the nav
            // item — this is the guard that matters if someone types the URL.
            path: 'organization',
            element: (
              <Lazy>
                <RoleRoute allowedRoles={[UserRole.OWNER, UserRole.ADMIN]}>
                  <OrganizationSettings />
                </RoleRoute>
              </Lazy>
            ),
          },
          {
            // No RoleRoute: GET /api/team/members is open to any member, and
            // the page degrades to a read-only roster for lower roles.
            path: 'team',
            element: (
              <Lazy>
                <TeamSettings />
              </Lazy>
            ),
          },
          {
            path: 'security',
            element: (
              <Lazy>
                <SecuritySettings />
              </Lazy>
            ),
          },
          {
            path: 'notifications',
            element: (
              <Lazy>
                <NotificationSettings />
              </Lazy>
            ),
          },
        ],
      },
    ],
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
