// ─────────────────────────────────────────────────────────────────────────────
// Application-wide constants
// ─────────────────────────────────────────────────────────────────────────────

// ── Routes ───────────────────────────────────────────────────────────────────
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
  VERIFY_OTP: '/verify-otp',
  TWO_FACTOR: '/2fa',
  INVITE: '/invite',
  SESSION_EXPIRED: '/session-expired',
  UNAUTHORIZED: '/unauthorized',
  ACCESS_DENIED: '/access-denied',
  DASHBOARD: '/dashboard',
  SETTINGS: {
    ROOT: '/settings',
    SECURITY: '/settings/security',
    PROFILE: '/settings/profile',
    ORGANIZATION: '/settings/organization',
    TEAM: '/settings/team',
    BILLING: '/settings/billing',
    NOTIFICATIONS: '/settings/notifications',
  },
  LEADS: '/leads',
  CONTACTS: '/contacts',
  COMPANIES: '/companies',
  DEALS: '/deals',
  TASKS: '/tasks',
  CALENDAR: '/calendar',
  ACTIVITY: '/activity',
  // Kept for the legacy /dashboard/teams route. The real team management page is
  // ROUTES.SETTINGS.TEAM — the sidebar points there now.
  TEAMS: '/dashboard/teams',
  REPORTS: '/reports',
} as const;

// ── API Endpoints ─────────────────────────────────────────────────────────────
export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    GOOGLE_LOGIN: '/auth/google',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    VALIDATE_RESET_TOKEN: '/auth/validate-reset-token',
    VERIFY_EMAIL: '/auth/verify-email',
    RESEND_VERIFICATION: '/auth/resend-verification',
    VERIFY_OTP: '/auth/verify-otp',
    RESEND_OTP: '/auth/resend-otp',
    ENABLE_2FA: '/auth/2fa/enable',
    VERIFY_2FA: '/auth/2fa/verify',
    DISABLE_2FA: '/auth/2fa/disable',
    CHANGE_PASSWORD: '/auth/change-password',
    ACCEPT_INVITE: '/auth/accept-invite',
    INVITE_TOKEN: '/auth/invite',
    LOGIN_HISTORY: '/auth/login-history',
    SESSIONS: '/auth/sessions',
  },
} as const;

// ── Query Keys ────────────────────────────────────────────────────────────────
export const QUERY_KEYS = {
  AUTH: {
    USER: ['auth', 'user'] as const,
    LOGIN_HISTORY: ['auth', 'login-history'] as const,
    SESSIONS: ['auth', 'sessions'] as const,
  },
} as const;

// ── Session ───────────────────────────────────────────────────────────────────
export const SESSION_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_TIMEOUT_MS ?? 1_800_000);
export const SESSION_WARNING_MS = Number(import.meta.env.VITE_SESSION_WARNING_MS ?? 300_000);
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_RETRY_ATTEMPTS = 2;

// ── Validation ────────────────────────────────────────────────────────────────
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const OTP_LENGTH = 6;

// ── App Meta ──────────────────────────────────────────────────────────────────
export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'ElevateCRM';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

// ── Error Messages ────────────────────────────────────────────────────────────
export const ERROR_MESSAGES = {
  GENERIC: 'Something went wrong. Please try again.',
  NETWORK: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  RATE_LIMIT: 'Too many requests. Please slow down.',
  SERVER: 'Server error. Our team has been notified.',
} as const;

// ── Storage Keys ──────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  USER: 'crm_user',
  ORGANIZATION: 'crm_org',
  THEME: 'crm_theme',
  REMEMBER_ME: 'crm_remember',
} as const;

// ── Permission Codes ──────────────────────────────────────────────────────────
//
// Re-exported from ./permissions so `@/constants` and `@/constants/permissions`
// cannot disagree. This file used to declare its own list — `leads:view`,
// `leads:create`, `leads:update`, `team:invite`, `billing:manage` and so on —
// which nothing imported and no server route had ever heard of. Two exports
// named PERMISSIONS with different string values is a landmine: the first
// component to gate on `leads:create` would have hidden itself forever, because
// the server grants `leads:write`.
//
// The surviving vocabulary is the one the API actually enforces: read / write /
// delete per resource, since POST and PATCH share a single guard server-side.
export { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole } from './permissions';
export type { Permission } from './permissions';
