// ─────────────────────────────────────────────────────────────────────────────
// pages/teams/InviteMemberModal.tsx
//
// VISUAL + WIRING PASS. The mutation, the endpoint (authService.inviteUser →
// POST /auth/invite) and the payload shape are untouched from the auth phase.
//
// Two things changed:
//  1. Invalidation key was ['team-members'], which matches nothing — useTeam's
//     keys are ['team','members'] / ['team','invites']. Inviting someone left
//     the pending-invites list stale until a manual refresh.
//  2. Chrome moved onto the design system: bg-overlay scrim instead of
//     bg-black/50, Field/controlClass inputs instead of hand-rolled ones, the
//     shared Button instead of a bg-blue-500 one, and the standard motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { UserPlus, X } from 'lucide-react';
import authService from '@/services/api/authService';
import { Button } from '@/components/ui/button';
import { Field, controlClass, selectClass } from '@/components/ui/field';
import { TEAM_QK } from '@/hooks/useTeam';
import { DURATION, EASE_OUT, overlayVariants } from '@/lib/motion';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Mirrors the server's ASSIGNABLE_ROLES — 'owner' is not grantable by invite.
const ROLES = [
  { value: 'admin', label: 'Admin', blurb: 'Manage the team and every record' },
  { value: 'manager', label: 'Manager', blurb: 'Delete records, read reports' },
  { value: 'member', label: 'Member', blurb: 'Create and edit records' },
  { value: 'viewer', label: 'Viewer', blurb: 'Read-only access' },
];

export default function InviteMemberModal({ isOpen, onClose }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const queryClient = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) => authService.inviteUser(data),
    onSuccess: () => {
      toast.success('Invitation sent');
      setEmail('');
      setRole('member');
      onClose();
      // The whole `team` prefix: an invite adds a pending row now, and becomes a
      // member row when accepted, so both lists are downstream of this.
      queryClient.invalidateQueries({ queryKey: TEAM_QK.all });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      // The server distinguishes ALREADY_MEMBER from INVITE_PENDING — passing
      // the message through tells the user which, instead of just "failed".
      toast.error(message || 'Failed to send invitation');
    },
  });

  const selected = ROLES.find((r) => r.value === role);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            role="dialog"
            aria-modal="true"
            aria-label="Invite team member"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border/60 bg-card shadow-pop"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  Invite team member
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  They’ll get an email with a link that expires in 24 hours.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                inviteMutation.mutate({ email: email.trim(), role });
              }}
              className="space-y-4 px-5 py-5"
            >
              <Field label="Email address" htmlFor="inviteEmail" required>
                <input
                  id="inviteEmail"
                  type="email"
                  required
                  autoFocus
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={controlClass}
                />
              </Field>

              <Field label="Role" htmlFor="inviteRole" hint={selected?.blurb}>
                <select
                  id="inviteRole"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={selectClass}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={inviteMutation.isPending}
                  disabled={!email.includes('@')}
                >
                  <UserPlus size={14} />
                  Send invitation
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
