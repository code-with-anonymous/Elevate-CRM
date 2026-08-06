// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/teamService.ts
// Acting on OTHER users — /api/team/*. Every mutation here is owner/admin only
// server-side, so a 403 from these is the RBAC working, not a bug.
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

/** Roles this endpoint will accept. `owner` is excluded — transfer is separate. */
export type AssignableRole = 'admin' | 'manager' | 'member' | 'viewer';

export type MemberStatus = 'Active' | 'Pending' | 'Suspended';

export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Lowercase, as stored — 'owner' | 'admin' | 'manager' | 'member' | 'viewer'. */
  role: string;
  avatarUrl: string | null;
  status: MemberStatus;
  lastLogin: string | null;
  joinedAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  invitedBy: string | null;
  invitedAt: string;
  expiresAt: string;
}

export const teamService = {
  getMembers: async (): Promise<{ members: TeamMember[]; total: number }> => {
    const res = await axiosInstance.get('/team/members');
    return res.data.data;
  },

  updateRole: async (id: string, role: AssignableRole): Promise<{ id: string; role: string }> => {
    const res = await axiosInstance.patch(`/team/members/${id}/role`, { role });
    return res.data.data;
  },

  removeMember: async (id: string): Promise<{ id: string }> => {
    const res = await axiosInstance.delete(`/team/members/${id}`);
    return res.data.data;
  },

  getInvites: async (): Promise<{ invites: PendingInvite[]; total: number }> => {
    const res = await axiosInstance.get('/team/invites');
    return res.data.data;
  },

  /** Rotates the token and extends the TTL — the old link stops working. */
  resendInvite: async (id: string): Promise<{ id: string; expiresAt: string }> => {
    const res = await axiosInstance.post(`/team/invites/${id}/resend`);
    return res.data.data;
  },

  revokeInvite: async (id: string): Promise<{ id: string }> => {
    const res = await axiosInstance.delete(`/team/invites/${id}`);
    return res.data.data;
  },
};
