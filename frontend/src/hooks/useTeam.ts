// ─────────────────────────────────────────────────────────────────────────────
// hooks/useTeam.ts
// Team roster + pending invitations.
//
// Role changes and removals invalidate BOTH members and invites: removing a
// member frees their email to be re-invited, and accepting an invite turns a
// pending row into a member row. Keeping the two lists independent is how you
// get a UI showing someone as both.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { teamService, type AssignableRole } from '@services/api/teamService';

export const TEAM_QK = {
  all: ['team'] as const,
  members: () => [...TEAM_QK.all, 'members'] as const,
  invites: () => [...TEAM_QK.all, 'invites'] as const,
};

/** Server message beats a generic string — RBAC refusals explain themselves. */
function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useTeamMembers() {
  return useQuery({
    queryKey: TEAM_QK.members(),
    queryFn: () => teamService.getMembers(),
    staleTime: 1000 * 60,
  });
}

/**
 * Pending invites are owner/admin only. Pass `enabled: false` for lower roles
 * so the page doesn't fire a request it knows will 403.
 */
export function usePendingInvites(enabled = true) {
  return useQuery({
    queryKey: TEAM_QK.invites(),
    queryFn: () => teamService.getInvites(),
    staleTime: 1000 * 60,
    enabled,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AssignableRole }) =>
      teamService.updateRole(id, role),
    onSuccess: () => {
      toast.success('Role updated');
      qc.invalidateQueries({ queryKey: TEAM_QK.all });
    },
    // The server rejects self-edits, owner edits, and privilege escalation with
    // specific messages. Surfacing them verbatim is what makes the rules
    // learnable instead of mysterious.
    onError: (err) => toast.error(errorMessage(err, 'Failed to update role')),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamService.removeMember(id),
    onSuccess: () => {
      toast.success('Member removed');
      qc.invalidateQueries({ queryKey: TEAM_QK.all });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to remove member')),
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamService.resendInvite(id),
    onSuccess: () => {
      toast.success('Invitation resent — the previous link no longer works');
      qc.invalidateQueries({ queryKey: TEAM_QK.invites() });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to resend invitation')),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamService.revokeInvite(id),
    onSuccess: () => {
      toast.success('Invitation revoked');
      qc.invalidateQueries({ queryKey: TEAM_QK.invites() });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to revoke invitation')),
  });
}
