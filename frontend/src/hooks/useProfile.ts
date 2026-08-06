// ─────────────────────────────────────────────────────────────────────────────
// hooks/useProfile.ts
// The signed-in user's own record.
//
// These mutations write through to authStore as well as the query cache. The
// user object in Zustand is what the sidebar avatar and TopNavbar read, so
// skipping that step leaves the header showing the old name until a reload.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  userService,
  type NotificationPreferencesPatch,
  type UpdateProfilePayload,
} from '@services/api/userService';
import { useAuthStore } from '@store/authStore';

export const PROFILE_QK = {
  notifications: ['users', 'notifications'] as const,
};

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
}

export function useUpdateProfile() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) => userService.updateProfile(data),
    onSuccess: (profile) => {
      toast.success('Profile saved');
      updateUser({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
      } as never);
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save profile')),
  });
}

export function useChangeEmail() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (email: string) => userService.changeEmail(email),
    onSuccess: (result) => {
      toast.success('Email updated — check your inbox to verify it');
      // isEmailVerified flips to false server-side, and ProtectedRoute redirects
      // unverified users to /verify-email. Mirroring it here means the guard
      // fires immediately rather than on the next page load.
      updateUser({
        email: result.email,
        isEmailVerified: result.isEmailVerified,
      } as never);
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to change email')),
  });
}

export function useUploadAvatar() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (dataUrl: string) => userService.uploadAvatar(dataUrl),
    onSuccess: (result) => {
      toast.success('Avatar updated');
      updateUser({ avatarUrl: result.avatarUrl } as never);
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to upload avatar')),
  });
}

export function useRemoveAvatar() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: () => userService.removeAvatar(),
    onSuccess: () => {
      toast.success('Avatar removed');
      updateUser({ avatarUrl: null } as never);
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to remove avatar')),
  });
}

// ── Notification preferences ──────────────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery({
    queryKey: PROFILE_QK.notifications,
    queryFn: () => userService.getNotificationPreferences(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      userService.updateNotificationPreferences(patch),
    onSuccess: (result) => {
      toast.success('Preferences saved');
      // The PATCH response carries the full merged state, so write it straight
      // into the cache — a refetch would be a round trip for data in hand, and
      // would briefly re-render the switches from stale values.
      qc.setQueryData(PROFILE_QK.notifications, result);
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save preferences')),
  });
}

export function useDeleteAccount() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  return useMutation({
    mutationFn: () => userService.deleteAccount(),
    onSuccess: () => {
      toast.success('Account deactivated');
      // Their token is still technically valid until it expires, but the account
      // is inactive — clearing auth and letting the router bounce them to /login
      // is the honest end state.
      clearAuth();
      window.location.href = '/login';
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to delete account')),
  });
}
