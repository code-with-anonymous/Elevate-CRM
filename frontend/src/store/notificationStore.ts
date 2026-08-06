import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  avatarColor?: string;
  initials?: string;
  title: string;
  timeAgo: string;
  read: boolean;
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [
    {
      id: '1',
      initials: 'LC',
      avatarColor: '#3B82F6',
      title: 'Lucas Carter moved to Won',
      timeAgo: '10m ago',
      read: false,
    },
    {
      id: '2',
      initials: 'OC',
      avatarColor: '#8B5CF6',
      title: 'Olivia Carter assigned a new deal',
      timeAgo: '1h ago',
      read: false,
    },
    {
      id: '3',
      initials: 'EW',
      avatarColor: '#10B981',
      title: 'Ethan Walker completed follow-up task',
      timeAgo: '3h ago',
      read: false,
    },
  ],
  unreadCount: 3,
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}));
