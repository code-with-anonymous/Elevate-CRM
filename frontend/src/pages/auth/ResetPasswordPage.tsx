import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/schemas/authSchemas';
import authService from '@/services/api/authService';
import { ROUTES } from '@/constants';
import { AlertCircle, XCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  // Validate token on mount
  const { data: validation, isLoading: isVerifying, isError: isValidationError } = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => authService.validateResetToken(token || ''),
    enabled: !!token,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (data: ResetPasswordFormValues) => authService.resetPassword(data),
    onSuccess: () => {
      toast.success('Password reset successfully!');
      navigate(ROUTES.LOGIN, { replace: true });
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to reset password. Please try again.');
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: token || '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password');

  const onSubmit = (data: ResetPasswordFormValues) => {
    setServerError(null);
    mutation.mutate(data);
  };

  if (!token) {
    return (
      <AuthLayout subtitle="Reset Password">
        <div className="flex flex-col items-center text-center">
          <XCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-lg font-semibold">Missing Reset Token</h2>
          <p className="mb-6 text-sm text-muted-foreground">The password reset link is invalid or missing.</p>
          <Button asChild className="w-full"><Link to={ROUTES.FORGOT_PASSWORD}>Request New Link</Link></Button>
        </div>
      </AuthLayout>
    );
  }

  if (isVerifying) {
    return (
      <AuthLayout subtitle="Verifying your request...">
        <div className="flex justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AuthLayout>
    );
  }

  if (isValidationError || !validation?.isValid) {
    return (
      <AuthLayout subtitle="Reset Password">
        <div className="flex flex-col items-center text-center">
          <XCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-lg font-semibold">Invalid or Expired Link</h2>
          <p className="mb-6 text-sm text-muted-foreground">This password reset link is no longer valid. It may have expired or already been used.</p>
          <Button asChild className="w-full"><Link to={ROUTES.FORGOT_PASSWORD}>Request New Link</Link></Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Choose a new password for your account.">
      <Helmet>
        <title>Reset Password | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <input type="hidden" {...register('token')} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">New Password</Label>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            error={!!errors.password}
            {...register('password')}
          />
          <PasswordStrengthMeter password={passwordValue} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="••••••••"
            error={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
        </div>

        <Button type="submit" isLoading={mutation.isPending} className="mt-2 w-full">
          Reset Password
        </Button>
      </form>
    </AuthLayout>
  );
}
