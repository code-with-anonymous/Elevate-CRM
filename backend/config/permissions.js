// ─────────────────────────────────────────────────────────────────────────────
// config/permissions.js — the role → permission policy, in one place
//
// Why this file exists: `User.permissions` has been on the schema since the
// first auth commit and has been `[]` for every user ever created. Nothing wrote
// to it, so `requirePermission()` on the server and `can()` / `usePermissions()`
// on the client could never return true — the whole fine-grained half of RBAC
// was scaffolding with no data behind it. Roles worked; permissions were a
// deny-everyone no-op that looked like a working feature.
//
// Permissions are now DERIVED from the role rather than stored per user. That
// keeps one authority: change a role, and the capability set follows on the next
// token. `User.permissions` is still honoured as an additive per-user override
// (see derivePermissions) so the field keeps its original meaning — grants only,
// never revocations, because a revocation would silently contradict the role the
// Team page displays.
//
// The mapping below restates the policy already enforced by requireMinRole() in
// the route files. They MUST agree. If you change a route guard, change it here:
//
//   read   (GET)         viewer+     leads / contacts / deals / tasks
//   write  (POST, PATCH) member+     ditto, plus the AI endpoints
//   delete (DELETE)      manager+    ditto
//   reports              manager+    /api/reports/*
//   team mutations       admin+      /api/team/* writes, /api/auth/invite
//   org settings         admin+      PATCH /api/organizations/current
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/**
 * Role hierarchy. Higher number = more authority.
 * Mirrored in middleware/rbac.js, frontend authStore, and team.controller.js —
 * four copies, deliberately: each gates a different thing (routes, UI, targets).
 */
const ROLE_LEVEL = Object.freeze({
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
});

/** The CRM record types that all share the read/write/delete policy. */
const RESOURCES = Object.freeze(['leads', 'contacts', 'deals', 'tasks']);

const readAll = RESOURCES.map((r) => `${r}:read`);
const writeAll = RESOURCES.map((r) => `${r}:write`);
const deleteAll = RESOURCES.map((r) => `${r}:delete`);

// Built cumulatively — each role is a strict superset of the one below it, which
// is what makes requireMinRole and requirePermission agree by construction.
const VIEWER_PERMS = [...readAll];
const MEMBER_PERMS = [...VIEWER_PERMS, ...writeAll];
const MANAGER_PERMS = [...MEMBER_PERMS, ...deleteAll, 'reports:read'];
const ADMIN_PERMS = [...MANAGER_PERMS, 'team:manage', 'org:manage'];
// Owner and admin hold the same permissions. The difference between them is not
// a capability — it is that the owner is a protected *target* (cannot be
// demoted or removed), which team.controller.js enforces per-target. Inventing
// an `owner:*` permission here would imply an endpoint that doesn't exist.
const OWNER_PERMS = [...ADMIN_PERMS];

const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(OWNER_PERMS),
  admin: Object.freeze(ADMIN_PERMS),
  manager: Object.freeze(MANAGER_PERMS),
  member: Object.freeze(MEMBER_PERMS),
  viewer: Object.freeze(VIEWER_PERMS),
});

/** Every permission string the app knows about — used to reject typos. */
const ALL_PERMISSIONS = Object.freeze([...new Set(OWNER_PERMS)]);

/**
 * Coerce whatever we were handed into a known lowercase role.
 *
 * The API serialises roles UPPERCASE for the frontend enum while Mongo stores
 * them lowercase, so role strings cross this boundary in both cases. An unknown
 * value falls back to `viewer` — the least privileged role — so a typo or a
 * missing claim fails closed rather than open.
 *
 * @param {unknown} role
 * @returns {'owner'|'admin'|'manager'|'member'|'viewer'}
 */
function normalizeRole(role) {
  const lower = String(role ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_LEVEL, lower) ? lower : 'viewer';
}

/**
 * Numeric authority level for a role. Unknown roles get 0, which is below
 * `viewer` (1) and therefore fails every comparison.
 * @param {unknown} role
 * @returns {number}
 */
function roleLevel(role) {
  const lower = String(role ?? '').trim().toLowerCase();
  return ROLE_LEVEL[lower] || 0;
}

/**
 * The permission set granted by a role alone.
 * @param {unknown} role
 * @returns {string[]}
 */
function permissionsForRole(role) {
  return [...ROLE_PERMISSIONS[normalizeRole(role)]];
}

/**
 * The effective permission set for a user document: role-derived, unioned with
 * any additive per-user grants in `user.permissions`.
 *
 * Unknown strings in the stored array are dropped rather than passed through —
 * an override is only meaningful if some route actually checks for it, and a
 * silent typo is how "but I granted it" bug reports happen.
 *
 * @param {{ role?: unknown, permissions?: unknown }} user
 * @returns {string[]}
 */
function derivePermissions(user) {
  const base = permissionsForRole(user?.role);
  const extra = Array.isArray(user?.permissions)
    ? user.permissions.filter((p) => ALL_PERMISSIONS.includes(p))
    : [];
  return [...new Set([...base, ...extra])];
}

module.exports = {
  ROLE_LEVEL,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  RESOURCES,
  normalizeRole,
  roleLevel,
  permissionsForRole,
  derivePermissions,
};
