// ─────────────────────────────────────────────────────────────────────────────
// src/schemas/authSchemas.ts
// Zod validation schemas for every authentication form
// ─────────────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, OTP_LENGTH } from '@constants/index';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable Field Validators
// ─────────────────────────────────────────────────────────────────────────────

const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .max(254, 'Email is too long')
  .toLowerCase()
  .trim();

/**
 * Password validation with all required rules:
 * - Min 8 / Max 128 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 * - No spaces
 */
const passwordBaseSchema = z
  .string()
  .min(1, 'Password is required')
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must not exceed ${String(PASSWORD_MAX_LENGTH)} characters`)
  .refine((val) => !/\s/.test(val), {
    message: 'Password must not contain spaces',
  })
  .refine((val) => /[A-Z]/.test(val), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine((val) => /[a-z]/.test(val), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine((val) => /\d/.test(val), {
    message: 'Password must contain at least one number',
  })
  .refine((val) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(val), {
    message: 'Password must contain at least one special character',
  });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Login Schema
// ─────────────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Register Schema
// ─────────────────────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    organizationName: z
      .string()
      .min(1, 'Organization name is required')
      .min(2, 'Organization name must be at least 2 characters')
      .max(100, 'Organization name must not exceed 100 characters')
      .trim(),
    firstName: z
      .string()
      .min(1, 'First name is required')
      .min(2, 'First name must be at least 2 characters')
      .max(50, 'First name must not exceed 50 characters')
      .trim(),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .min(2, 'Last name must be at least 2 characters')
      .max(50, 'Last name must not exceed 50 characters')
      .trim(),
    email: emailSchema,
    phone: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (val === undefined || val === '') {
            return true;
          }
          // E.164 format validation (+1234567890)
          return /^\+[1-9]\d{6,14}$/.test(val);
        },
        { message: 'Please enter a valid phone number' }
      ),
    password: passwordBaseSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    agreedToTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms of Service to continue' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Forgot Password Schema
// ─────────────────────────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reset Password Schema
// ─────────────────────────────────────────────────────────────────────────────

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordBaseSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Change Password Schema
// ─────────────────────────────────────────────────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordBaseSchema,
    confirmNewPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from your current password',
    path: ['newPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 6. OTP Schema
// ─────────────────────────────────────────────────────────────────────────────

export const otpSchema = z.object({
  code: z
    .string()
    .min(1, 'OTP code is required')
    .length(OTP_LENGTH, `OTP must be exactly ${String(OTP_LENGTH)} digits`)
    .regex(/^\d+$/, 'OTP must contain digits only'),
});

export type OtpFormValues = z.infer<typeof otpSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 7. Accept Invite Schema
// ─────────────────────────────────────────────────────────────────────────────

export const acceptInviteSchema = z
  .object({
    firstName: z
      .string()
      .min(1, 'First name is required')
      .min(2, 'First name must be at least 2 characters')
      .max(50, 'First name must not exceed 50 characters')
      .trim(),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .min(2, 'Last name must be at least 2 characters')
      .max(50, 'Last name must not exceed 50 characters')
      .trim(),
    password: passwordBaseSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type AcceptInviteFormValues = z.infer<typeof acceptInviteSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 8. Phone Verification Schema
// ─────────────────────────────────────────────────────────────────────────────

export const phoneVerificationSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .refine((val) => /^\+[1-9]\d{6,14}$/.test(val), {
      message: 'Please enter a valid international phone number',
    }),
  countryCode: z
    .string()
    .min(1, 'Country code is required')
    .max(2, 'Invalid country code')
    .toUpperCase(),
});

export type PhoneVerificationFormValues = z.infer<typeof phoneVerificationSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Password Strength Calculation
// Returns a value 0–4 representing Weak / Fair / Good / Strong
// ─────────────────────────────────────────────────────────────────────────────

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4;

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrengthLevel, string> = {
  0: '',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

export const PASSWORD_STRENGTH_COLORS: Record<PasswordStrengthLevel, string> = {
  0: 'bg-muted',
  1: 'bg-destructive',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

export function calculatePasswordStrength(password: string): PasswordStrengthLevel {
  if (password.length === 0) {
    return 0;
  }

  let score = 0;

  if (password.length >= PASSWORD_MIN_LENGTH) {
    score += 1;
  }
  if (password.length >= 12) {
    score += 0.5;
  }
  if (/[A-Z]/.test(password)) {
    score += 0.5;
  }
  if (/[a-z]/.test(password)) {
    score += 0.5;
  }
  if (/\d/.test(password)) {
    score += 0.5;
  }
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    score += 1;
  }
  if (password.length >= 16 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) {
    score += 0.5;
  }

  if (score <= 1) {
    return 1;
  }
  if (score <= 2) {
    return 2;
  }
  if (score <= 3) {
    return 3;
  }
  return 4;
}
