// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/activityService.ts — /api/activity-log
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

export type ActivityType = 'lead' | 'task' | 'deal' | 'member';

export interface ActivityItem {
  /** Composite `type-entityId-timestamp` — these rows are derived, not stored. */
  id: string;
  type: ActivityType;
  /** Verb phrase: "moved to Qualified", "won a deal", "joined the organisation". */
  action: string;
  /** The thing acted on — lead name, task title, deal title. */
  subject: string;
  note: string | null;
  at: string;
  entityId: string | null;
  entityType: 'Lead' | 'Task' | 'Deal' | 'User';
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  } | null;
}

export interface ActivityLogParams {
  page?: number;
  limit?: number;
  type?: ActivityType | '';
}

export interface ActivityLogResponse {
  activities: ActivityItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  types: ActivityType[];
}

export const activityService = {
  getActivityLog: async (params: ActivityLogParams = {}): Promise<ActivityLogResponse> => {
    const search = new URLSearchParams();
    if (params.page) search.set('page', String(params.page));
    if (params.limit) search.set('limit', String(params.limit));
    if (params.type) search.set('type', params.type);
    const qs = search.toString() ? `?${search.toString()}` : '';
    const res = await axiosInstance.get(`/activity-log${qs}`);
    return res.data.data;
  },
};
