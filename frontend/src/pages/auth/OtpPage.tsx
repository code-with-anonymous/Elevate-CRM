import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AuthLayout from '@/components/auth/AuthLayout';
import OtpInput from '@/components/auth/OtpInput';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import authService from '@/services/api/authService';
import { ROUTES, OTP_RESEND_COOLDOWN_SECONDS, OTP_LENGTH } from '@/constants';
import { AlertCircle } from 'lucide-react';
import { OtpContext } from '@/types/auth';

export default function OtpPage() {
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { otpDestination, isAuthenticated } = useAuth();
  
  // Actually, we could extract context from route state, assuming default for now
  const context = OtpContext.PHONE_VERIFICATION;
  const identifier = otpDestination || 'your device';

  const verifyMutation = useMutation({
    mutationFn: (code: string) => authService.verifyOtp({ code, identifier, context }),
    onSuccess: () => {
      toast.success('Verification successful!');
      navigate(ROUTES.DASHBOARD, { replace: true });
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Invalid verification code.');
      setOtp('');
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authService.resendOtp(identifier),
    onSuccess: () => {
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      toast.success('Code resent successfully!');
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to resend code.');
    },
  });

  // Auto-submit when length is reached
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !verifyMutation.isPending) {
      setServerError(null);
      verifyMutation.mutate(otp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [cooldown]);

  const handleResend = (e: React.MouseEvent) => {
    e.preventDefault();
    if (cooldown === 0) {
      setServerError(null);
      resendMutation.mutate();
    }
  };

  return (
    <AuthLayout subtitle="Enter the 6-digit verification code">
      <Helmet>
        <title>Verify Code | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <div className="mb-6 text-center text-sm text-muted-foreground">
        We sent a code to <span className="font-medium text-foreground">{identifier}</span>
      </div>

      <div className="mb-8">
        <OtpInput
          value={otp}
          onChange={setOtp}
          error={!!serverError}
        />
      </div>

      <Button 
        onClick={() => verifyMutation.mutate(otp)}
        disabled={otp.length !== OTP_LENGTH || verifyMutation.isPending}
        isLoading={verifyMutation.isPending}
        className="w-full"
      >
        Verify Code
      </Button>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Didn't receive the code?{' '}
        {cooldown > 0 ? (
          <span className="font-medium text-muted-foreground">Resend in {cooldown}s</span>
        ) : (
          <button 
            type="button" 
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm"
          >
            {resendMutation.isPending ? 'Sending...' : 'Resend Code'}
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
