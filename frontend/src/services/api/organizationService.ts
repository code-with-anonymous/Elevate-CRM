// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/organizationService.ts
// /api/organizations/current — no id in the path; the org is the one on your
// token. Writes are owner/admin only server-side.
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface Organization {
  id: string;
  name: string;
  /** Issued at registration, read-only thereafter. */
  slug: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  logoUrl: string | null;
  timezone: string;
  dateFormat: DateFormat;
  /** Denormalised counter on the document. */
  memberCount: number;
  /** Live count, only present on GET. Trust this one. */
  activeMembers?: number;
  createdAt: string;
}

export interface UpdateOrganizationPayload {
  name?: string;
  timezone?: string;
  dateFormat?: DateFormat;
  /** Data URL, or null to clear. */
  logoUrl?: string | null;
}

export const organizationService = {
  getCurrent: async (): Promise<Organization> => {
    const res = await axiosInstance.get('/organizations/current');
    return res.data.data;
  },

  update: async (data: UpdateOrganizationPayload): Promise<Organization> => {
    const res = await axiosInstance.patch('/organizations/current', data);
    return res.data.data;
  },
};
