// ─────────────────────────────────────────────────────────────────────────────
// src/components/layout/Sidebar.tsx
// Icon rail. Active state is a 2px accent bar plus a tinted glyph — no filled
// pill. The rail stays dark in both themes, the way Linear and Vercel keep a
// constant chrome edge regardless of canvas.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Calendar,
  CheckSquare,
  GitBranch,
  LayoutDashboard,
  Settings,
  UserCircle,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';
import { ROUTES } from '@/constants';
import { PERMISSIONS, type Permission } from '@/constants/permissions';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';

// ── Nav item type ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: number;
  /**
   * Permission required to see this item. Omit for items every authenticated
   * role can reach.
   *
   * Without this, Reports sat in the rail for viewers and members, whose only
   * feedback on clicking it was the Access Denied page — the route guard was
   * doing its job, but offering the door at all was the bug.
   */
  permission?: Permission;
}

const ICON = 19;

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={ICON} />, path: ROUTES.DASHBOARD },
  { label: 'Contacts', icon: <UserCircle size={ICON} />, path: ROUTES.CONTACTS },
  { label: 'Leads', icon: <Users size={ICON} />, path: ROUTES.LEADS },
  { label: 'Pipeline', icon: <GitBranch size={ICON} />, path: '/pipeline' },
  { label: 'Tasks', icon: <CheckSquare size={ICON} />, path: ROUTES.TASKS },
  { label: 'Calendar', icon: <Calendar size={ICON} />, path: ROUTES.CALENDAR },
  { label: 'Activity', icon: <Activity size={ICON} />, path: ROUTES.ACTIVITY },
  // Repointed from ROUTES.TEAMS (/dashboard/teams), which renders the mock
  // single-row TeamsPage from before the team API existed. /settings/team is the
  // real one — roles, invites, removal, all server-enforced.
  { label: 'Team', icon: <UsersRound size={ICON} />, path: ROUTES.SETTINGS.TEAM },
  // Mirrors requireMinRole('manager') on /api/reports/* and the RoleRoute on
  // /reports. Three places agree on one rule; the server is the one that counts.
  {
    label: 'Reports',
    icon: <BarChart3 size={ICON} />,
    path: ROUTES.REPORTS,
    permission: PERMISSIONS.REPORTS_READ,
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', icon: <Settings size={ICON} />, path: ROUTES.SETTINGS.ROOT },
];

// ── Tooltip ───────────────────────────────────────────────────────────────────

function SidebarTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md border border-sidebar-border bg-sidebar-popover px-2 py-1 text-[11px] font-medium tracking-tight text-sidebar-foreground shadow-pop"
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Nav link ──────────────────────────────────────────────────────────────────

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <SidebarTooltip label={item.label}>
      <NavLink
        to={item.path}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-lg',
          'transition-colors duration-150',
          active
            ? 'text-sidebar-primary'
            : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
        )}
      >
        {item.icon}
        {active && (
          <motion.span
            layoutId="sidebar-active-bar"
            transition={{ duration: DURATION.normal, ease: EASE_OUT }}
            className="absolute -left-3 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-primary"
          />
        )}
      </NavLink>
    </SidebarTooltip>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permission || can(item.permission)),
    [can]
  );

  // Longest match wins, and only one item is ever active.
  //
  // The old rule was `pathname.startsWith(path)` with a special case for
  // Dashboard. That broke the moment Team started pointing at /settings/team:
  // on that route BOTH "Team" (/settings/team) and "Settings" (/settings)
  // matched, so two rail items lit up at once.
  //
  // Segment-aware too — plain startsWith would make '/leadsomething' match
  // '/leads', and exact equality alone would leave '/leads/:id' with nothing
  // highlighted.
  const activePath = useMemo(() => {
    const { pathname } = location;
    return [...navItems, ...BOTTOM_ITEMS]
      .map((item) => item.path)
      .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
      .sort((a, b) => b.length - a.length)[0];
  }, [location, navItems]);

  const isActive = (path: string): boolean => path === activePath;

  const userInitials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U';

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col items-center border-r border-sidebar-border bg-sidebar py-5 md:flex">
      {/* Mark */}
      <div className="accent-gradient mb-7 flex h-9 w-9 items-center justify-center rounded-[10px] shadow-sm">
        <Zap size={17} className="fill-white text-white" />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => (
          <RailLink key={item.path} item={item} active={isActive(item.path)} />
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 pt-2">
        {BOTTOM_ITEMS.map((item) => (
          <RailLink key={item.path} item={item} active={isActive(item.path)} />
        ))}

        <div className="my-2 h-px w-7 bg-sidebar-border" />

        <SidebarTooltip label={user ? `${user.firstName} ${user.lastName}` : 'Profile'}>
          <button
            type="button"
            className="accent-gradient flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-1 ring-white/10 transition-opacity duration-150 hover:opacity-90"
            aria-label="User profile"
          >
            {userInitials}
          </button>
        </SidebarTooltip>
      </div>
    </aside>
  );
}
