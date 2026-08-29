import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation, useQuery } from '@tanstack/react-query';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInviteSchema, type AcceptInviteFormValues } from '@/schemas/authSchemas';
import authService from '@/services/api/authService';
import { useAuthStore } from '@/store/authStore';
import { markActivity } from '@/hooks/useAuthActions';
import { isCompletedAuth } from '@/types/auth';
import { ROUTES } from '@/constants';
import { AlertCircle, XCircle } from 'lucide-react';

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  // Validate token
  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['invite-token', token],
    queryFn: () => authService.validateInviteToken(token || ''),
    enabled: !!token,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (data: AcceptInviteFormValues & { token: string }) => authService.acceptInvite(data),
    onSuccess: (data) => {
      // Auto-login
      if (!isCompletedAuth(data)) {
        setServerError('Unexpected response from the server. Please try signing in.');
        return;
      }
      setAuth(data.user, data.tokens.accessToken, data.organization, data.tokens.expiresIn);
      markActivity();
      navigate(ROUTES.DASHBOARD, { replace: true });
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to accept invitation. Please try again.');
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AcceptInviteFormValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password');

  const onSubmit = (data: AcceptInviteFormValues) => {
    if (!token) return;
    setServerError(null);
    mutation.mutate({ ...data, token });
  };

  if (isLoading) {
    return (
      <AuthLayout subtitle="Loading invitation details...">
        <div className="flex justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AuthLayout>
    );
  }

  if (isError || !invite || invite.isExpired || invite.isUsed) {
    return (
      <AuthLayout subtitle="Invalid Invitation">
        <Helmet><title>Invalid Invite | ElevateCRM</title></Helmet>
        <div className="flex flex-col items-center text-center">
          <XCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-lg font-semibold">Invalid or Expired Invitation</h2>
          <p className="mb-6 text-sm text-muted-foreground">This invitation link is no longer valid. It may have expired, already been used, or was revoked by the administrator.</p>
          <Button asChild className="w-full">
            <Link to={ROUTES.LOGIN}>Go to Login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle={`Join ${invite.organizationName} on ElevateCRM`}>
      <Helmet>
        <title>Accept Invitation | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>Email (from invite)</Label>
          <Input type="email" value={invite.email} disabled className="bg-muted" />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              placeholder="John"
              error={!!errors.firstName}
              {...register('firstName')}
            />
            {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              placeholder="Doe"
              error={!!errors.lastName}
              {...register('lastName')}
            />
            {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
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
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <PasswordInput
              id="confirmPassword"
              placeholder="••••••••"
              error={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
          </div>
        </div>

        <Button type="submit" isLoading={mutation.isPending} className="mt-4 w-full">
          Create Account & Join
        </Button>
      </form>
    </AuthLayout>
  );
}
