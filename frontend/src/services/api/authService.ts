// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/authService.ts
// All authentication API calls — fully typed with TypeScript interfaces
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance, { refreshWithRetry } from './axiosInstance';
import { API_ENDPOINTS } from '@constants/index';
import type {
  AuthResponse,
  Organization,
  User,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  ChangePasswordPayload,
  OtpPayload,
  AcceptInvitePayload,
  LoginHistoryEntry,
  Session,
  TwoFactorSetupResponse,
  InviteToken,
} from '@/types/auth';

// ── Response wrapper for simple message responses ─────────────────────────────
interface MessageResponse {
  message: string;
  success: boolean;
}

interface ValidateResetTokenResponse {
  isValid: boolean;
  email?: string;
  expiresAt?: string;
}

/** POST /auth/refresh — tokens, plus the server's current view of the user. */
export interface RefreshResponse {
  tokens: { accessToken: string; expiresIn: number };
  user?: User;
  organization?: Organization;
}

// ── Auth Service ──────────────────────────────────────────────────────────────

// ── Backend envelope type ─────────────────────────────────────────────────────
// Backend wraps every response: { success, message, data: <actual payload> }
type Envelope<T> = { success: boolean; message: string; data: T };

const authService = {
  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a new user + organization
   * POST /auth/register
   */
  register: async (data: RegisterPayload): Promise<AuthResponse> => {
    const response = await axiosInstance.post<Envelope<AuthResponse>>(
      API_ENDPOINTS.AUTH.REGISTER,
      data
    );
    return response.data.data;
  },

  // ── Login ─────────────────────────────────────────────────────────────────

  /**
   * Authenticate user with email + password
   * POST /auth/login
   * Returns AuthResponse. When `requiresTwoFactor` is true the response carries
   * only that flag and a `tempToken` — no user, org or tokens — and the caller
   * must redirect to /2fa. Narrow with isCompletedAuth() before using it.
   */
  login: async (data: LoginPayload): Promise<AuthResponse> => {
    const response = await axiosInstance.post<Envelope<AuthResponse>>(
      API_ENDPOINTS.AUTH.LOGIN,
      data
    );
    return response.data.data;
  },

  /**
   * Authenticate user with Google Access Token
   * POST /auth/google
   */
  googleLogin: async (accessToken: string): Promise<AuthResponse> => {
    const response = await axiosInstance.post<Envelope<AuthResponse>>(
      API_ENDPOINTS.AUTH.GOOGLE_LOGIN,
      { accessToken }
    );
    return response.data.data;
  },

  // ── Logout ────────────────────────────────────────────────────────────────

  /**
   * Invalidate current session + clear httpOnly refresh cookie
   * POST /auth/logout
   */
  logout: async (): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.LOGOUT
    );
    return response.data;
  },

  // ── Token Refresh ─────────────────────────────────────────────────────────

  /**
   * Silent token refresh using httpOnly refresh cookie
   * POST /auth/refresh
   *
   * Returns the current user and organization as well as the tokens. Callers
   * should prefer these over any locally persisted copy — this response is the
   * only point in a page-reload bootstrap where the server gets to correct a
   * role that changed (or was tampered with) since the session started.
   *
   * Typed optional because a deployed backend older than this change sends
   * tokens only; useRefreshSession falls back to the persisted user in that case.
   *
   * @param opts.tolerateColdStart
   *   Route through refreshWithRetry — a 45s timeout and three attempts with
   *   backoff — instead of one 30s call. Pass this on the app-boot restore and
   *   nowhere else. That call decides whether the user is signed in at all, and
   *   on a spun-down Render free-tier instance a 30-60s cold start reads as a
   *   dead session: the user lands on /login with a valid cookie in the jar, and
   *   there is no "next request" to recover on because they never got in.
   *   A mid-session call can afford to fail — the interceptor retries it.
   */
  refreshToken: async (opts?: { tolerateColdStart?: boolean }): Promise<RefreshResponse> => {
    const response = opts?.tolerateColdStart
      ? await refreshWithRetry()
      : await axiosInstance.post<Envelope<RefreshResponse>>(API_ENDPOINTS.AUTH.REFRESH);
    return (response.data as Envelope<RefreshResponse>).data;
  },

  // ── Password Management ───────────────────────────────────────────────────

  /**
   * Send password reset email
   * POST /auth/forgot-password
   */
  forgotPassword: async (email: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.FORGOT_PASSWORD,
      { email }
    );
    return response.data;
  },

  /**
   * Reset password with token from email link
   * POST /auth/reset-password
   */
  resetPassword: async (data: ResetPasswordPayload): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.RESET_PASSWORD,
      data
    );
    return response.data;
  },

  /**
   * Validate a password reset token before showing the reset form
   * GET /auth/validate-reset-token/:token
   */
  validateResetToken: async (token: string): Promise<ValidateResetTokenResponse> => {
    const response = await axiosInstance.get<Envelope<ValidateResetTokenResponse>>(
      `${API_ENDPOINTS.AUTH.VALIDATE_RESET_TOKEN}/${token}`
    );
    return response.data.data;
  },

  /**
   * Change password for authenticated users
   * POST /auth/change-password
   */
  changePassword: async (data: ChangePasswordPayload): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.CHANGE_PASSWORD,
      data
    );
    return response.data;
  },

  // ── Email Verification ────────────────────────────────────────────────────

  /**
   * Verify email address with token from email link
   * POST /auth/verify-email
   */
  verifyEmail: async (token: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.VERIFY_EMAIL,
      { token }
    );
    return response.data;
  },

  /**
   * Resend email verification link
   * POST /auth/resend-verification
   */
  resendVerification: async (email: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.RESEND_VERIFICATION,
      { email }
    );
    return response.data;
  },

  // ── OTP ───────────────────────────────────────────────────────────────────

  /**
   * Verify OTP code (registration or login 2FA context)
   * POST /auth/verify-otp
   */
  verifyOtp: async (data: OtpPayload): Promise<AuthResponse> => {
    const response = await axiosInstance.post<Envelope<AuthResponse>>(
      API_ENDPOINTS.AUTH.VERIFY_OTP,
      data
    );
    return response.data.data;
  },

  /**
   * Resend OTP to phone/email
   * POST /auth/resend-otp
   */
  resendOtp: async (identifier: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.RESEND_OTP,
      { identifier }
    );
    return response.data;
  },

  // ── Two-Factor Authentication ─────────────────────────────────────────────

  /**
   * Initiate 2FA setup — returns QR code URL + backup codes
   * POST /auth/2fa/enable
   */
  enable2FA: async (): Promise<TwoFactorSetupResponse> => {
    const response = await axiosInstance.post<Envelope<TwoFactorSetupResponse>>(
      API_ENDPOINTS.AUTH.ENABLE_2FA
    );
    return response.data.data;
  },

  /**
   * Verify TOTP code to complete 2FA setup or login
   * POST /auth/2fa/verify
   */
  /**
   * Complete 2FA SETUP — proves the user can read a code from the app they just
   * enrolled, and flips is2FAEnabled on.
   *
   * Returns a message only, no tokens. This was declared `Promise<AuthResponse>`,
   * which is simply untrue: the endpoint sends `{ success, message }` with no
   * `data`. That lie is what let TwoFactorPage compile
   * `data.tokens.accessToken` against `undefined` and crash at runtime.
   *
   * To complete a 2FA *login*, use verifyOtp — a different endpoint.
   */
  verify2FA: async (code: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.VERIFY_2FA,
      { code }
    );
    return response.data;
  },

  /**
   * Disable 2FA — requires verification code
   * POST /auth/2fa/disable
   */
  /**
   * Turn 2FA off. Requires the account password as well as a current code —
   * removing a protection is the direction that deserves the extra proof.
   */
  disable2FA: async (code: string, password: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.DISABLE_2FA,
      { code, password }
    );
    return response.data;
  },

  // ── Invitations ───────────────────────────────────────────────────────────
  inviteUser: async (data: { email: string; role: string }) => {
    const response = await axiosInstance.post(
      API_ENDPOINTS.AUTH.INVITE_TOKEN, // This uses '/auth/invite' from your constants
      data
    );
    return response.data;
  },
  /**
   * Accept team invitation and create account
   * POST /auth/accept-invite
   */
  acceptInvite: async (data: AcceptInvitePayload): Promise<AuthResponse> => {
    const response = await axiosInstance.post<Envelope<AuthResponse>>(
      API_ENDPOINTS.AUTH.ACCEPT_INVITE,
      data
    );
    return response.data.data;
  },

  /**
   * Validate an invite token and get invite details
   * GET /auth/invite/:token
   */
  validateInviteToken: async (token: string): Promise<InviteToken> => {
    const response = await axiosInstance.get<Envelope<InviteToken>>(
      `${API_ENDPOINTS.AUTH.INVITE_TOKEN}/${token}`
    );
    return response.data.data;
  },

  // ── Sessions & History ────────────────────────────────────────────────────

  /**
   * Fetch login history for current user
   * GET /auth/login-history
   */
  getLoginHistory: async (): Promise<LoginHistoryEntry[]> => {
    const response = await axiosInstance.get<Envelope<LoginHistoryEntry[]>>(
      API_ENDPOINTS.AUTH.LOGIN_HISTORY
    );
    return response.data.data;
  },

  /**
   * Fetch all active sessions for current user
   * GET /auth/sessions
   */
  getSessions: async (): Promise<Session[]> => {
    const response = await axiosInstance.get<Envelope<Session[]>>(
      API_ENDPOINTS.AUTH.SESSIONS
    );
    return response.data.data;
  },


  /**
   * Revoke a specific session by ID
   * DELETE /auth/sessions/:sessionId
   */
  revokeSession: async (sessionId: string): Promise<MessageResponse> => {
    const response = await axiosInstance.delete<MessageResponse>(
      `${API_ENDPOINTS.AUTH.SESSIONS}/${sessionId}`
    );
    return response.data;
  },

  
};

export default authService;
