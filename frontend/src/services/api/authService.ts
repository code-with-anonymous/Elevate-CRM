// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/authService.ts
// All authentication API calls — fully typed with TypeScript interfaces
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';
import { API_ENDPOINTS } from '@constants/index';
import type {
  AuthResponse,
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
   * Returns AuthResponse; if requires2FA is true → redirect to /2fa
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
   */
  refreshToken: async (): Promise<{ tokens: { accessToken: string; expiresIn: number } }> => {
    const response = await axiosInstance.post<Envelope<{ tokens: { accessToken: string; expiresIn: number } }>>(
      API_ENDPOINTS.AUTH.REFRESH
    );
    return response.data.data;
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
  verify2FA: async (code: string): Promise<AuthResponse> => {
    const response = await axiosInstance.post<Envelope<AuthResponse>>(
      API_ENDPOINTS.AUTH.VERIFY_2FA,
      { code }
    );
    return response.data.data;
  },

  /**
   * Disable 2FA — requires verification code
   * POST /auth/2fa/disable
   */
  disable2FA: async (code: string): Promise<MessageResponse> => {
    const response = await axiosInstance.post<MessageResponse>(
      API_ENDPOINTS.AUTH.DISABLE_2FA,
      { code }
    );
    return response.data;
  },

  // ── Invitations ───────────────────────────────────────────────────────────

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
