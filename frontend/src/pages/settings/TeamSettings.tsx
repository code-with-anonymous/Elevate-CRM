// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/TeamSettings.tsx  (/settings/team)
//
// This is where RBAC becomes visible. Every rule below is ALSO enforced in
// team.controller.js — the client checks exist so the UI doesn't offer actions
// that will fail, not because they secure anything:
//
//   · only owner/admin see the role dropdown or remove button
//   · you can't change or remove yourself
//   · the owner can't be demoted or removed by anyone
//   · you can't act on, or promote to, a level at or above your own
//
// If you want to see the server half working, open devtools and PATCH
// /api/team/members/<owner-id>/role — it 403s with OWNER_PROTECTED.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  Crown,
  Eye,
  Mail,
  RotateCw,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { selectClass } from '@/components/ui/field';
import SettingsSection from '@/pages/settings/SettingsSection';
import InviteMemberModal from '@/pages/teams/InviteMemberModal';
import {
  usePendingInvites,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
  useTeamMembers,
  useUpdateMemberRole,
} from '@/hooks/useTeam';
import type { AssignableRole, TeamMember } from '@/services/api/teamService';
import { useAuthStore } from '@/store/authStore';
import { formatRelativeDate } from '@/lib/format';
import { DURATION, EASE_OUT, overlayVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

// ── Role vocabulary ───────────────────────────────────────────────────────────
// Levels mirror middleware/rbac.js. They're duplicated here on purpose: this
// copy drives which options a dropdown offers, the server's copy decides what
// actually happens. They must agree, and only one of them is authoritative.
const ROLE_LEVEL: Record<string, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

const ROLE_META: Record<string, { label: string; icon: typeof Crown; blurb: string }> = {
  owner: { label: 'Owner', icon: Crown, blurb: 'Full control. Cannot be changed or removed.' },
  admin: { label: 'Admin', icon: Shield, blurb: 'Manage the team and every record.' },
  manager: { label: 'Manager', icon: UserCog, blurb: 'Can delete records and read reports.' },
  member: { label: 'Member', icon: Users, blurb: 'Create and edit records.' },
  viewer: { label: 'Viewer', icon: Eye, blurb: 'Read-only across the app.' },
};

const ASSIGNABLE: AssignableRole[] = ['admin', 'manager', 'member', 'viewer'];

// ── Confirm dialog ────────────────────────────────────────────────────────────
// A typed-confirmation modal rather than window.confirm: removing a colleague
// deserves the person's name in front of them, which confirm() can't style.

function ConfirmRemove({
  member,
  onCancel,
  onConfirm,
  isPending,
}: {
  member: TeamMember | null;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AnimatePresence>
      {member && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onCancel}
            className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            role="dialog"
            aria-modal="true"
            aria-label={`Remove ${member.firstName} ${member.lastName}`}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-card p-5 shadow-pop"
          >
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Remove {member.firstName} {member.lastName}?
            </h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              They lose access immediately. Leads, deals, and tasks assigned to them stay
              exactly where they are — nothing is reassigned or deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={onConfirm} isLoading={isPending}>
                <Trash2 size={14} />
                Remove member
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Member row ────────────────────────────────────────────────────────────────

interface MemberRowProps {
  member: TeamMember;
  actorId: string;
  actorLevel: number;
  canManage: boolean;
  onRoleChange: (id: string, role: AssignableRole) => void;
  onRemove: (member: TeamMember) => void;
  isUpdating: boolean;
}

function MemberRow({
  member,
  actorId,
  actorLevel,
  canManage,
  onRoleChange,
  onRemove,
  isUpdating,
}: MemberRowProps) {
  const role = member.role.toLowerCase();
  const meta = ROLE_META[role] ?? ROLE_META.member;
  const RoleIcon = meta.icon;

  const isSelf = member.id === actorId;
  const isOwner = role === 'owner';
  const targetLevel = ROLE_LEVEL[role] ?? 0;

  // The exact predicate the server uses, restated. Three independent reasons a
  // row is locked, and the tooltip says which one applies — "why is this
  // greyed out" is the most common question a permissions UI creates.
  const lockReason = !canManage
    ? 'Only owners and admins can change roles'
    : isSelf
      ? 'You can’t change your own role'
      : isOwner
        ? 'The owner’s role is protected'
        : targetLevel >= actorLevel
          ? 'You can’t act on someone at or above your own level'
          : null;

  const locked = lockReason !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 transition-colors duration-150 hover:bg-muted/30">
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border/60"
          />
        ) : (
          <AvatarWithInitials firstName={member.firstName} lastName={member.lastName} size="sm" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">
            {member.firstName} {member.lastName}
            {isSelf && (
              <span className="ml-2 rounded-full border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                You
              </span>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
        </div>
      </div>

      {/* Role — dropdown when actionable, static pill when not */}
      <div className="w-[150px] shrink-0">
        {locked ? (
          <span
            title={lockReason ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            <RoleIcon size={11} className="shrink-0" />
            {meta.label}
          </span>
        ) : (
          <select
            value={role}
            aria-label={`Role for ${member.firstName} ${member.lastName}`}
            onChange={(e) => onRoleChange(member.id, e.target.value as AssignableRole)}
            disabled={isUpdating}
            className={cn(selectClass, 'h-8 text-xs')}
          >
            {ASSIGNABLE.map((r) => (
              <option
                key={r}
                value={r}
                // Can't grant at or above your own level — so those options are
                // absent from the list rather than present and rejected.
                disabled={(ROLE_LEVEL[r] ?? 0) >= actorLevel}
              >
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Status */}
      <div className="w-[92px] shrink-0">
        <StatusBadge
          status={member.status}
          size="sm"
          tone={
            member.status === 'Active'
              ? 'positive'
              : member.status === 'Pending'
                ? 'warn'
                : 'neutral'
          }
        />
      </div>

      {/* Last active */}
      <div className="w-[110px] shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {member.lastLogin ? formatRelativeDate(member.lastLogin) : 'Never'}
      </div>

      {/* Remove */}
      <div className="w-8 shrink-0">
        {!locked && (
          <button
            type="button"
            onClick={() => onRemove(member)}
            aria-label={`Remove ${member.firstName} ${member.lastName}`}
            title="Remove from organisation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamSettings() {
  const user = useAuthStore((s) => s.user);
  const actorId = user?.id ?? '';
  const actorRole = String(user?.role ?? '').toLowerCase();
  const actorLevel = ROLE_LEVEL[actorRole] ?? 0;
  const canManage = actorRole === 'owner' || actorRole === 'admin';

  const { data: memberData, isLoading, isError, refetch } = useTeamMembers();
  // Pending invites are owner/admin only server-side — don't fire a request
  // that's guaranteed to 403.
  const { data: inviteData } = usePendingInvites(canManage);

  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const resendInvite = useResendInvite();
  const revokeInvite = useRevokeInvite();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null);

  // Owner first, then by level descending, then alphabetically — a roster
  // sorted by signup date tells you nothing about who can do what.
  const members = useMemo(() => {
    return [...(memberData?.members ?? [])].sort((a, b) => {
      const la = ROLE_LEVEL[a.role.toLowerCase()] ?? 0;
      const lb = ROLE_LEVEL[b.role.toLowerCase()] ?? 0;
      if (la !== lb) return lb - la;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [memberData]);

  const invites = inviteData?.invites ?? [];

  return (
    <div className="space-y-5">
      {/* ── Members ────────────────────────────────────────────────────────── */}
      <SettingsSection
        title={`Members${memberData ? ` · ${memberData.total}` : ''}`}
        description="Roles decide what each person can do. Changing a role signs that person out; it applies as soon as they sign back in."
        footer={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} />
              Invite member
            </Button>
          ) : undefined
        }
        footerHint={
          canManage ? undefined : 'Only owners and admins can invite or change members.'
        }
        className="[&>div]:px-0 [&>div]:py-0"
      >
        {isError ? (
          <div className="flex flex-col items-start gap-3 px-5 py-6">
            <p className="text-[13px] text-muted-foreground">Couldn’t load the team.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-48 animate-pulse rounded bg-muted/60" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted/60" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Column labels — hidden below lg, where rows reflow and a header
                row would no longer line up with anything. */}
            <div className="hidden items-center gap-x-4 border-b border-border/60 bg-muted/25 px-5 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground lg:flex">
              <span className="flex-1">Member</span>
              <span className="w-[150px]">Role</span>
              <span className="w-[92px]">Status</span>
              <span className="w-[110px]">Last active</span>
              <span className="w-8" />
            </div>

            <div className="divide-y divide-border/50">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  actorId={actorId}
                  actorLevel={actorLevel}
                  canManage={canManage}
                  onRoleChange={(id, role) => updateRole.mutate({ id, role })}
                  onRemove={setPendingRemoval}
                  isUpdating={updateRole.isPending}
                />
              ))}
            </div>
          </>
        )}
      </SettingsSection>

      {/* ── Pending invitations ────────────────────────────────────────────── */}
      {canManage && invites.length > 0 && (
        <SettingsSection
          title={`Pending invitations · ${invites.length}`}
          description="Invited but not yet accepted. Resending issues a new link and invalidates the old one."
          className="[&>div]:px-0 [&>div]:py-0"
        >
          <div className="divide-y divide-border/50">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-warn/10 text-status-warn">
                  <Mail size={15} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {invite.email}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {ROLE_META[invite.role.toLowerCase()]?.label ?? invite.role}
                    {invite.invitedBy && ` · invited by ${invite.invitedBy}`}
                  </p>
                </div>

                <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <Clock size={11} />
                  Expires {formatRelativeDate(invite.expiresAt)}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => resendInvite.mutate(invite.id)}
                    disabled={resendInvite.isPending}
                    aria-label={`Resend invitation to ${invite.email}`}
                    title="Resend — issues a new link"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <RotateCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite.mutate(invite.id)}
                    disabled={revokeInvite.isPending}
                    aria-label={`Revoke invitation to ${invite.email}`}
                    title="Revoke"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>
      )}

      {/* ── Role reference ─────────────────────────────────────────────────── */}
      <SettingsSection
        title="What each role can do"
        description="Enforced server-side on every request, not just hidden in the interface."
      >
        <dl className="space-y-2.5">
          {(['owner', 'admin', 'manager', 'member', 'viewer'] as const).map((r) => {
            const meta = ROLE_META[r];
            const Icon = meta.icon;
            return (
              <div key={r} className="flex items-start gap-2.5">
                <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <dt className="w-[70px] shrink-0 text-[13px] font-medium text-foreground">
                  {meta.label}
                </dt>
                <dd className="text-[13px] text-muted-foreground">{meta.blurb}</dd>
              </div>
            );
          })}
        </dl>
      </SettingsSection>

      <ConfirmRemove
        member={pendingRemoval}
        isPending={removeMember.isPending}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (!pendingRemoval) return;
          removeMember.mutate(pendingRemoval.id, {
            onSettled: () => setPendingRemoval(null),
          });
        }}
      />

      <InviteMemberModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
