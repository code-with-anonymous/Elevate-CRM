import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import authService from '@/services/api/authService';
import { ROUTES, OTP_RESEND_COOLDOWN_SECONDS } from '@/constants';
import { AlertCircle, CheckCircle2, Mail, Loader2, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const updateUser = useAuthStore((s) => s.updateUser);
  
  const [cooldown, setCooldown] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  // If token is present, verify automatically
  const { isPending: isVerifying, isError: isVerifyError, isSuccess: isVerifySuccess } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: async () => {
      if (!token) return null;
      const res = await authService.verifyEmail(token);
      updateUser({ isEmailVerified: true });
      return res;
    },
    enabled: !!token,
    retry: false,
  });

  // Handle successful verification redirect
  useEffect(() => {
    if (isVerifySuccess) {
      toast.success('Email verified successfully!');
      const timer = setTimeout(() => {
        navigate(ROUTES.DASHBOARD, { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVerifySuccess, navigate]);

  // Resend email mutation
  const resendMutation = useMutation({
    mutationFn: (email: string) => authService.resendVerification(email),
    onSuccess: () => {
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      toast.success('Verification email sent!');
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to resend email.');
    },
  });

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [cooldown]);

  const handleResend = () => {
    if (user?.email) {
      setServerError(null);
      resendMutation.mutate(user.email);
    }
  };

  // If not authenticated and no token, shouldn't be here (handled by route guard usually, but fallback)
  if (!isAuthenticated && !token) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (token) {
    return (
      <AuthLayout subtitle="Verifying your email address">
        <Helmet>
          <title>Verify Email | ElevateCRM</title>
        </Helmet>
        
        <div className="flex flex-col items-center justify-center text-center">
          {isVerifying && (
            <>
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
              <h2 className="mb-2 text-lg font-semibold">Verifying Email...</h2>
              <p className="text-sm text-muted-foreground">Please wait while we verify your email address.</p>
            </>
          )}

          {isVerifySuccess && (
            <>
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">Email Verified!</h2>
              <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
            </>
          )}

          {isVerifyError && (
            <>
              <XCircle className="mb-4 h-12 w-12 text-destructive" />
              <h2 className="mb-2 text-lg font-semibold">Verification Failed</h2>
              <p className="mb-6 text-sm text-muted-foreground">The verification link is invalid or has expired.</p>
              <Button asChild className="w-full">
                <Link to={ROUTES.VERIFY_EMAIL}>Request New Link</Link>
              </Button>
            </>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Waiting state
  return (
    <AuthLayout subtitle="Please verify your email to continue">
      <Helmet>
        <title>Verify Email | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">Check your inbox</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          We've sent a verification email to <span className="font-medium text-foreground">{user?.email}</span>. 
          Please click the link in the email to verify your account.
        </p>

        <Button 
          onClick={handleResend} 
          disabled={cooldown > 0 || resendMutation.isPending} 
          variant="outline" 
          className="w-full"
        >
          {resendMutation.isPending ? 'Sending...' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend verification email'}
        </Button>
      </div>
    </AuthLayout>
  );
}
