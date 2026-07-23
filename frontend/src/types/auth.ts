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

export enum OtpContext {
  REGISTRATION = 'REGISTRATION',
  LOGIN = 'LOGIN',
  PHONE_VERIFICATION = 'PHONE_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
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

export interface AuthResponse {
  user: User;
  organization: Organization;
  tokens: AuthTokens;
  /** true when 2FA is required to complete login */
  requires2FA?: boolean;
  /** masked phone/email for OTP destination display */
  otpDestination?: string;
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

export interface OtpPayload {
  code: string;
  identifier: string;
  context: OtpContext;
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
  /** true after login, but before 2FA is completed */
  pendingTwoFactor: boolean;
  /** masked destination for OTP (e.g., "***@gmail.com" or "+1***5678") */
  otpDestination: string | null;
}

export interface AuthActions {
  setAuth: (user: User, token: string, org: Organization, expiresIn?: number) => void;
  clearAuth: () => void;
  updateUser: (partial: Partial<User>) => void;
  setPermissions: (permissions: string[]) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  setPendingTwoFactor: (pending: boolean, destination?: string) => void;
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
