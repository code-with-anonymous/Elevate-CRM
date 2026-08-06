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
      <OtpInputComponent
        value={value}
        onChange={onChange}
        numInputs={OTP_LENGTH}
        renderSeparator={<span className="w-2" />}
        renderInput={(props) => <input {...props} />}
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
