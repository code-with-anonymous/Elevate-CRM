import { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from '@/components/auth/AuthLayout';
import OtpInput from '@/components/auth/OtpInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import authService from '@/services/api/authService';
import { markActivity } from '@/hooks/useAuthActions';
import { useAuthStore } from '@/store/authStore';
import { ROUTES, OTP_LENGTH } from '@/constants';
import { isCompletedAuth } from '@/types/auth';
import { AlertCircle, ShieldCheck } from 'lucide-react';

export default function TwoFactorPage() {
  const [otp, setOtp] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const tempToken = useAuthStore((s) => s.tempToken);
  const pendingTwoFactor = useAuthStore((s) => s.pendingTwoFactor);

  // Where login was originally headed, forwarded through the 2FA detour.
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo ?? ROUTES.DASHBOARD;

  const verifyMutation = useMutation({
    // verifyOtp, NOT verify2FA.
    //
    // Two different endpoints that both take a 6-digit code:
    //   /auth/2fa/verify  — completes SETUP. Returns a message, no tokens.
    //   /auth/verify-otp  — completes LOGIN. Returns user + org + tokens and
    //                       sets the refresh cookie. This is the one.
    // This page called the first, so `data.tokens` was undefined and finishing a
    // 2FA login threw instead of signing anyone in.
    mutationFn: (code: string) => authService.verifyOtp({ code }),
    onSuccess: (data) => {
      if (!isCompletedAuth(data)) {
        setServerError('Unexpected response from the server. Please sign in again.');
        return;
      }
      // setAuth also clears pendingTwoFactor and the temp token.
      setAuth(data.user, data.tokens.accessToken, data.organization, data.tokens.expiresIn);
      markActivity();
      navigate(returnTo, { replace: true });
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setServerError(message || 'Invalid code.');
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

  // Below every hook, not above — an early return placed before useEffect
  // changes the hook count between renders and React throws.
  //
  // The temp token lives in memory only, so a reload here drops it and there is
  // nothing left to authenticate the verify call with. Send them back to sign in
  // rather than presenting a form whose every submission would 401.
  if (!pendingTwoFactor || !tempToken) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ returnTo }} />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    verifyMutation.mutate(useBackupCode ? backupCode : otp);
  };

  // 2FA is authenticator-app only — there is no SMS delivery in this product.
  const activeMethodName = 'Authenticator App';

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
            Enter one of the recovery codes you saved when you turned on 2FA.
            Each one works once.
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
              placeholder="e.g. K7PQ-3XMR"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
              error={!!serverError}
              className="text-center font-mono tracking-widest uppercase"
              maxLength={9}
              autoComplete="one-time-code"
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
