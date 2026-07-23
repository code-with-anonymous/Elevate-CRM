import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { registerSchema, type RegisterFormValues } from '@/schemas/authSchemas';
import authService from '@/services/api/authService';
import { ROUTES } from '@/constants';
import { AlertCircle } from 'lucide-react';
import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const navigate = useNavigate();

  const registerMutation = useMutation({
    mutationFn: (data: RegisterFormValues) => authService.register(data),
    onSuccess: () => {
      // Upon successful registration, redirect to verify email
      navigate(ROUTES.VERIFY_EMAIL);
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to create account. Please try again.');
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      organizationName: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      agreedToTerms: undefined,
    },
  });

  const passwordValue = watch('password');
  const phoneValue = watch('phone');

  const onSubmit = (data: RegisterFormValues) => {
    setServerError(null);
    registerMutation.mutate(data);
  };

  return (
    <AuthLayout maxWidth="lg" subtitle="Start your 14-day free trial. No credit card required.">
      <Helmet>
        <title>Create Account | ElevateCRM</title>
      </Helmet>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="organizationName">Company Name</Label>
          <Input
            id="organizationName"
            placeholder="Acme Corp"
            error={!!errors.organizationName}
            {...register('organizationName')}
          />
          {errors.organizationName && <p className="text-sm text-destructive">{errors.organizationName.message}</p>}
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            autoComplete="email"
            error={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone Number (Optional)</Label>
          <PhoneInput
            international
            defaultCountry="US"
            value={phoneValue}
            onChange={(val) => setValue('phone', val || '')}
            className={`input-base ${errors.phone ? 'error' : ''} flex items-center gap-2`}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
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

        <div className="mt-2 flex items-start gap-2">
          <Checkbox 
            id="agreedToTerms" 
            className="mt-1"
            {...register('agreedToTerms')} 
          />
          <Label htmlFor="agreedToTerms" className="font-normal leading-tight text-muted-foreground">
            I agree to the{' '}
            <Link to="#" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="#" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </Label>
        </div>
        {errors.agreedToTerms && <p className="text-sm text-destructive">{errors.agreedToTerms.message}</p>}

        <Button type="submit" isLoading={registerMutation.isPending} className="mt-4 w-full">
          Create Account
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={ROUTES.LOGIN} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
