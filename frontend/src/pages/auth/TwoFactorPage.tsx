import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from '@/components/auth/AuthLayout';
import OtpInput from '@/components/auth/OtpInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import authService from '@/services/api/authService';
import { useAuthStore } from '@/store/authStore';
import { ROUTES, OTP_LENGTH } from '@/constants';
import { AlertCircle, ShieldCheck } from 'lucide-react';

export default function TwoFactorPage() {
  const [otp, setOtp] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const setAuth = useAuthStore((s) => s.setAuth);

  const verifyMutation = useMutation({
    mutationFn: (code: string) => authService.verify2FA(code),
    onSuccess: (data) => {
      // Complete login process
      setAuth(data.user, data.tokens.accessToken, data.organization, data.tokens.expiresIn);
      navigate(ROUTES.DASHBOARD, { replace: true });
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Invalid code.');
      if (!useBackupCode) setOtp('');
    },
  });

  // Auto-submit OTP
  useEffect(() => {
    if (!useBackupCode && otp.length === OTP_LENGTH && !verifyMutation.isPending) {
      setServerError(null);
      verifyMutation.mutate(otp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, useBackupCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    verifyMutation.mutate(useBackupCode ? backupCode : otp);
  };

  const activeMethodName = user?.twoFactorMethod === 'SMS' ? 'SMS' : 'Authenticator App';

  return (
    <AuthLayout subtitle="Two-factor authentication is required">
      <Helmet>
        <title>Two-Factor Auth | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        {!useBackupCode ? (
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your <span className="font-medium text-foreground">{activeMethodName}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter one of your 8-character recovery backup codes.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {!useBackupCode ? (
          <div className="flex justify-center">
            <OtpInput
              value={otp}
              onChange={setOtp}
              error={!!serverError}
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <Input
              type="text"
              placeholder="e.g. A1B2C3D4"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
              error={!!serverError}
              className="text-center font-mono tracking-widest uppercase"
              maxLength={10}
            />
          </div>
        )}

        <Button 
          type="submit"
          disabled={useBackupCode ? backupCode.length < 8 : otp.length !== OTP_LENGTH}
          isLoading={verifyMutation.isPending}
          className="w-full"
        >
          Verify
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        <button 
          type="button" 
          onClick={() => {
            setUseBackupCode(!useBackupCode);
            setServerError(null);
            setOtp('');
            setBackupCode('');
          }}
          className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm"
        >
          {useBackupCode ? `Use ${activeMethodName} instead` : 'Use a backup recovery code'}
        </button>
      </div>
    </AuthLayout>
  );
}
