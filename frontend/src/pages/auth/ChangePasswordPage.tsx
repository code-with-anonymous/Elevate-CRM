import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { changePasswordSchema, type ChangePasswordFormValues } from '@/schemas/authSchemas';
import authService from '@/services/api/authService';
import { AlertCircle } from 'lucide-react';

export default function ChangePasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: ChangePasswordFormValues) => authService.changePassword(data),
    onSuccess: () => {
      toast.success('Password updated successfully');
      reset();
    },
    onError: (error: any) => {
      setServerError(error?.response?.data?.message || 'Failed to change password. Please try again.');
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  const passwordValue = watch('newPassword');

  const onSubmit = (data: ChangePasswordFormValues) => {
    setServerError(null);
    mutation.mutate(data);
  };

  return (
    <div className="max-w-md">
      <Helmet>
        <title>Security Settings | ElevateCRM</title>
      </Helmet>

      <div className="mb-6">
        <h2 className="text-lg font-medium">Change Password</h2>
        <p className="text-sm text-muted-foreground">Update your password to keep your account secure.</p>
      </div>

      {serverError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <PasswordInput
            id="currentPassword"
            placeholder="••••••••"
            error={!!errors.currentPassword}
            {...register('currentPassword')}
          />
          {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="newPassword">New Password</Label>
          <PasswordInput
            id="newPassword"
            placeholder="••••••••"
            error={!!errors.newPassword}
            {...register('newPassword')}
          />
          <PasswordStrengthMeter password={passwordValue} />
          {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
          <PasswordInput
            id="confirmNewPassword"
            placeholder="••••••••"
            error={!!errors.confirmNewPassword}
            {...register('confirmNewPassword')}
          />
          {errors.confirmNewPassword && <p className="text-sm text-destructive">{errors.confirmNewPassword.message}</p>}
        </div>

        <Button type="submit" isLoading={mutation.isPending} className="mt-2 w-full md:w-auto">
          Update Password
        </Button>
      </form>
    </div>
  );
}
