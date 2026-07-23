import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/schemas/authSchemas';
import authService from '@/services/api/authService';
import { ROUTES } from '@/constants';
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: (email: string) => authService.forgotPassword(email),
    onSuccess: () => {
      setIsSuccess(true);
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to send reset email.');
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (data: ForgotPasswordFormValues) => {
    setServerError(null);
    mutation.mutate(data.email);
  };

  if (isSuccess) {
    return (
      <AuthLayout subtitle="Check your email">
        <Helmet>
          <title>Forgot Password | ElevateCRM</title>
        </Helmet>
        
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">Password Reset Sent</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            If an account exists with that email, we have sent password reset instructions.
          </p>
          <Button asChild className="w-full">
            <Link to={ROUTES.LOGIN}>Return to Login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Enter your email to reset your password.">
      <Helmet>
        <title>Forgot Password | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            error={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <Button type="submit" isLoading={mutation.isPending} className="mt-2 w-full">
          Send Reset Link
        </Button>
      </form>

      <div className="mt-6 flex justify-center">
        <Link to={ROUTES.LOGIN} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}
