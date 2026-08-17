// ─────────────────────────────────────────────────────────────────────────────
// src/constants/permissions.ts
//
// The permission strings the UI gates on. The server sends the authoritative
// list on every login and every token refresh (see backend/config/permissions.js
// — that file is the policy; this one is the vocabulary plus a fallback).
//
// Nothing here secures anything. Every gated action is enforced again by
// requireMinRole() on the route, and a hidden button is still reachable with
// curl. The point of gating the UI is that a viewer shouldn't be offered a
// "Delete" that answers 403 — a permissions system that only speaks in failed
// requests reads as a broken app.
// ─────────────────────────────────────────────────────────────────────────────
import { UserRole } from '@/types/auth';

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  LEADS_READ: 'leads:read',
  LEADS_WRITE: 'leads:write',
  LEADS_DELETE: 'leads:delete',

  CONTACTS_READ: 'contacts:read',
  CONTACTS_WRITE: 'contacts:write',
  CONTACTS_DELETE: 'contacts:delete',

  DEALS_READ: 'deals:read',
  DEALS_WRITE: 'deals:write',
  DEALS_DELETE: 'deals:delete',

  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TASKS_DELETE: 'tasks:delete',

  REPORTS_READ: 'reports:read',
  TEAM_MANAGE: 'team:manage',
  ORG_MANAGE: 'org:manage',
} as const;

/** Union of every known permission string — `can('leeds:write')` won't compile. */
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ── Fallback mapping ──────────────────────────────────────────────────────────
//
// A deliberate second copy of the server's role → permission table, used ONLY
// when the store has no permission list to work with. That happens in two real
// cases: a session that predates the server sending derived permissions (its
// persisted array is `[]`), and the brief window on reload before the refresh
// call returns.
//
// Without the fallback an empty array means `can()` is false for everything, so
// an owner would see an app with every control hidden — a worse failure than a
// slightly stale capability set. Deriving from the role instead fails toward
// what the role actually grants, and the server still rejects anything wrong.
//
// If you change backend/config/permissions.js, change this too.

const READ: Permission[] = [
  PERMISSIONS.LEADS_READ,
  PERMISSIONS.CONTACTS_READ,
  PERMISSIONS.DEALS_READ,
  PERMISSIONS.TASKS_READ,
];

const WRITE: Permission[] = [
  PERMISSIONS.LEADS_WRITE,
  PERMISSIONS.CONTACTS_WRITE,
  PERMISSIONS.DEALS_WRITE,
  PERMISSIONS.TASKS_WRITE,
];

const DELETE: Permission[] = [
  PERMISSIONS.LEADS_DELETE,
  PERMISSIONS.CONTACTS_DELETE,
  PERMISSIONS.DEALS_DELETE,
  PERMISSIONS.TASKS_DELETE,
];

const VIEWER_PERMS: Permission[] = [...READ];
const MEMBER_PERMS: Permission[] = [...VIEWER_PERMS, ...WRITE];
const MANAGER_PERMS: Permission[] = [...MEMBER_PERMS, ...DELETE, PERMISSIONS.REPORTS_READ];
const ADMIN_PERMS: Permission[] = [
  ...MANAGER_PERMS,
  PERMISSIONS.TEAM_MANAGE,
  PERMISSIONS.ORG_MANAGE,
];

/**
 * Owner and admin hold the same permissions — the owner's privilege is that
 * they are a protected *target* (cannot be demoted or removed), which is a
 * per-target rule in the team controller, not a capability.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.OWNER]: ADMIN_PERMS,
  [UserRole.ADMIN]: ADMIN_PERMS,
  [UserRole.MANAGER]: MANAGER_PERMS,
  [UserRole.MEMBER]: MEMBER_PERMS,
  [UserRole.VIEWER]: VIEWER_PERMS,
};

/** Permissions a role grants on its own, for use when no list is available. */
export function permissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? VIEWER_PERMS;
}
