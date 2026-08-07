// ─────────────────────────────────────────────────────────────────────────────
// src/components/auth/OtpInput.tsx
//
// FIXED: the component imported `OTPInput` but rendered `<OtpInputComponent>`,
// an identifier that was never declared. Two consequences:
//   · `tsc -b` failed, so `npm run build` exited 1 and never reached vite —
//     any CI or Vercel deploy died here.
//   · At runtime it threw a ReferenceError, so OtpPage and TwoFactorPage
//     crashed on render. OTP sign-in and 2FA verification were both broken.
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentProps } from 'react';
import OTPInput from 'react-otp-input';
import { OTP_LENGTH } from '@/constants';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}

export function OtpInput({ value, onChange, error }: OtpInputProps) {
  return (
    <div className="flex w-full justify-center">
      <OTPInput
        value={value}
        onChange={onChange}
        numInputs={OTP_LENGTH}
        renderSeparator={<span className="w-2" />}
        // Explicitly typed — the library's callback parameter was implicitly
        // `any`, which `noImplicitAny` rejected.
        renderInput={(props: ComponentProps<'input'>) => <input {...props} />}
        inputStyle={{
          width: '3rem',
          height: '3.5rem',
          margin: '0',
          fontSize: '1.25rem',
          fontWeight: '600',
          borderRadius: '0.5rem',
          border: '1px solid',
          borderColor: error ? 'var(--color-destructive)' : 'var(--color-border)',
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-foreground)',
          outline: 'none',
          boxShadow: error ? '0 0 0 3px hsl(from var(--color-destructive) h s l / 0.1)' : 'none',
        }}
        containerStyle={{
          display: 'flex',
          gap: '0.5rem',
        }}
      />
    </div>
  );
}

export default OtpInput;
