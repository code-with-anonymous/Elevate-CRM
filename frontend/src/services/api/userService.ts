// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/userService.ts
// The signed-in user's own record — /api/users/*.
// Acting on other people lives in teamService.ts.
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface ProfileResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
}

// ── Notification preferences ──────────────────────────────────────────────────

export type NotificationEvent =
  | 'leadAssigned'
  | 'taskDueSoon'
  | 'dealWon'
  | 'teamChanges'
  | 'weeklySummary';

export type NotificationChannels = { inApp: boolean; email: boolean };

export type NotificationPreferences = Record<NotificationEvent, NotificationChannels>;

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
  /** Canonical event list from the server — the source of truth for valid keys. */
  events: NotificationEvent[];
}

/** Partial updates only touch the channels named — never a whole-object write. */
export type NotificationPreferencesPatch = Partial<
  Record<NotificationEvent, Partial<NotificationChannels>>
>;

export const userService = {
  updateProfile: async (data: UpdateProfilePayload): Promise<ProfileResponse> => {
    const res = await axiosInstance.patch('/users/me', data);
    return res.data.data;
  },

  /** De-verifies the account and re-sends the verification mail. */
  changeEmail: async (email: string): Promise<{ email: string; isEmailVerified: boolean }> => {
    const res = await axiosInstance.post('/users/email', { email });
    return res.data.data;
  },

  /** `avatar` is a data URL — resize with lib/imageResize before calling. */
  uploadAvatar: async (avatar: string): Promise<{ avatarUrl: string }> => {
    const res = await axiosInstance.post('/users/avatar', { avatar });
    return res.data.data;
  },

  removeAvatar: async (): Promise<{ avatarUrl: null }> => {
    const res = await axiosInstance.delete('/users/avatar');
    return res.data.data;
  },

  /** Soft delete. The server refuses this for the organisation owner. */
  deleteAccount: async (): Promise<{ id: string }> => {
    const res = await axiosInstance.delete('/users/me');
    return res.data.data;
  },

  getNotificationPreferences: async (): Promise<NotificationPreferencesResponse> => {
    const res = await axiosInstance.get('/users/notifications');
    return res.data.data;
  },

  updateNotificationPreferences: async (
    preferences: NotificationPreferencesPatch
  ): Promise<NotificationPreferencesResponse> => {
    const res = await axiosInstance.patch('/users/notifications', { preferences });
    return res.data.data;
  },
};
