// ─────────────────────────────────────────────────────────────────────────────
// src/types/auth.ts
// Complete TypeScript type definitions for the authentication system
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum TwoFactorMethod {
  AUTHENTICATOR = 'AUTHENTICATOR',
  SMS = 'SMS',
}

export enum OrgPlan {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

// ── Core Entities ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: UserRole;
  permissions: string[];
  isEmailVerified: boolean;
  is2FAEnabled: boolean;
  twoFactorMethod: TwoFactorMethod | null;
  phone: string | null;
  jobTitle: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  logoUrl: string | null;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

// ── Token Types ───────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  /** seconds until expiry */
  expiresIn: number;
}

// ── Auth Response ─────────────────────────────────────────────────────────────

/**
 * Response to POST /auth/login (and register / accept-invite / verify-otp).
 *
 * When 2FA is on, the server answers with ONLY `requiresTwoFactor` and
 * `tempToken` — `user`, `organization` and `tokens` are all absent. That's why
 * they're optional here: typing them as required is what let
 * `setAuth(data.user, data.tokens.accessToken, ...)` compile against a response
 * that has neither, and crash at runtime for every 2FA user.
 */
export interface AuthResponse {
  user?: User;
  organization?: Organization;
  tokens?: AuthTokens;
  /**
   * True when the password was accepted but a second factor is still needed.
   *
   * NOTE the name. This was `requires2FA` on the client while the server has
   * always sent `requiresTwoFactor` — so the check was permanently `undefined`,
   * the 2FA branch never ran, and login fell through to dereferencing the
   * absent `tokens`. A 2FA-enabled account simply could not sign in.
   */
  requiresTwoFactor?: boolean;
  /**
   * Short-lived (5 min) half-finished-login token. Carries `twoFAPending: true`
   * and is accepted by exactly one endpoint, POST /auth/verify-otp.
   * Hold it in memory only — it is a credential in flight.
   */
  tempToken?: string;
}

/** An AuthResponse that actually completed a sign-in. */
export interface CompletedAuthResponse extends AuthResponse {
  user: User;
  organization: Organization;
  tokens: AuthTokens;
}

/**
 * Narrow an AuthResponse to one carrying a real session.
 *
 * Every caller of setAuth needs this. The 2FA branch returns a response with no
 * user, organization or tokens, and the previous type claimed all three were
 * always present — so `data.tokens.accessToken` type-checked and then threw.
 * Prefer this over `!` or a cast: the whole point is that the absence is real.
 */
export function isCompletedAuth(res: AuthResponse): res is CompletedAuthResponse {
  return Boolean(res.user && res.organization && res.tokens);
}

// ── Request Payloads ──────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterPayload {
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string | undefined;
  agreedToTerms: boolean;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/**
 * Payload for POST /auth/verify-otp — completing a 2FA login.
 *
 * Just the code. The account is identified by the `tempToken` Bearer, not by
 * anything in the body. This used to carry `identifier` and `context` for an
 * email/SMS OTP flow that was never built: the server reads neither, and the
 * only caller hardcoded `context: PHONE_VERIFICATION` with a "assuming default
 * for now" comment.
 *
 * `code` accepts either a 6-digit authenticator code or a backup code.
 */
export interface OtpPayload {
  code: string;
}

export interface AcceptInvitePayload {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
}

export interface PhoneVerificationPayload {
  phone: string;
  countryCode: string;
}

export interface Enable2FAPayload {
  method: TwoFactorMethod;
}

export interface Verify2FAPayload {
  code: string;
  method: TwoFactorMethod;
}

export interface Disable2FAPayload {
  code: string;
}

// ── Error Types ───────────────────────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
  errors?: FieldError[];
}

// ── Invite Types ──────────────────────────────────────────────────────────────

export interface InviteToken {
  token: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  organizationName: string;
  organizationLogoUrl: string | null;
  invitedBy: string;
  expiresAt: string;
  isExpired: boolean;
  isUsed: boolean;
}

// ── Session & History Types ───────────────────────────────────────────────────

export interface LoginHistoryEntry {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location: string | null;
  createdAt: string;
  isCurrent: boolean;
  wasSuccessful: boolean;
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location: string | null;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

// ── 2FA Setup ─────────────────────────────────────────────────────────────────

export interface TwoFactorSetupResponse {
  qrCodeUrl: string;
  secret: string;
  backupCodes: string[];
}

// ── Zustand Store State ───────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  organization: Organization | null;
  /** Access token kept in memory ONLY — never persisted to localStorage */
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  permissions: string[];
  role: UserRole;
  sessionExpiry: number | null;
  /** true after the password is accepted, but before the 2FA code is */
  pendingTwoFactor: boolean;
  /**
   * The half-finished-login token, held in memory ONLY — never persisted,
   * exactly like `accessToken`. Sent as the Bearer for POST /auth/verify-otp,
   * which is the one endpoint that accepts it.
   *
   * Replaces `otpDestination`, which described a masked email/SMS destination
   * for a delivery channel this product doesn't have: nothing ever set it, and
   * the 2FA method is an authenticator app, which has no destination to show.
   */
  tempToken: string | null;
}

export interface AuthActions {
  setAuth: (user: User, token: string, org: Organization, expiresIn?: number) => void;
  clearAuth: () => void;
  updateUser: (partial: Partial<User>) => void;
  setPermissions: (permissions: string[]) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  /** Enter the pending-2FA state, holding the temp token for the verify call. */
  setPendingTwoFactor: (pending: boolean, tempToken?: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export type AuthStore = AuthState & AuthActions;

// ── Utility Types ─────────────────────────────────────────────────────────────

/** Extracts all non-function values from a type */
export type StateOnly<T> = {
  [K in keyof T as T[K] extends (...args: unknown[]) => unknown ? never : K]: T[K];
};

/** Deep partial — makes all nested properties optional */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
