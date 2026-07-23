// ─────────────────────────────────────────────────────────────────────────────
// src/components/layout/Sidebar.tsx
// Collapsed icon-only sidebar — dark bg, tooltips, active states
// ─────────────────────────────────────────────────────────────────────────────
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  UserCircle,
  GitBranch,
  CheckSquare,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  Zap,
  UsersRound,
} from 'lucide-react';
import { ROUTES } from '@/constants';
import { useAuthStore } from '@/store/authStore';

// ── Nav item type ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: ROUTES.DASHBOARD },
  { label: 'Contacts', icon: <UserCircle size={20} />, path: ROUTES.CONTACTS },
  { label: 'Leads', icon: <Users size={20} />, path: ROUTES.LEADS },
  { label: 'Pipeline', icon: <GitBranch size={20} />, path: ROUTES.DEALS },
  { label: 'Tasks', icon: <CheckSquare size={20} />, path: ROUTES.TASKS },
  { label: 'Calendar', icon: <Calendar size={20} />, path: ROUTES.CALENDAR },
  { label: 'Teams', icon: <UsersRound size={20} />, path: ROUTES.TEAMS },
  { label: 'Reports', icon: <BarChart3 size={20} />, path: ROUTES.REPORTS },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', icon: <Settings size={20} />, path: ROUTES.SETTINGS.ROOT },
];

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

function SidebarTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full ml-3 z-50 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg whitespace-nowrap"
          >
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sidebar component ─────────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const isActive = (path: string): boolean => {
    if (path === ROUTES.DASHBOARD) return location.pathname === ROUTES.DASHBOARD;
    return location.pathname.startsWith(path);
  };

  const userInitials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U';

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center bg-sidebar py-5">
      {/* Logo */}
      <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/25">
        <Zap size={20} className="text-white" />
      </div>

      {/* Primary nav */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <SidebarTooltip key={item.path} label={item.label}>
              <NavLink
                to={item.path}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-sidebar-accent text-blue-400'
                    : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
                aria-label={item.label}
              >
                {item.icon}
                {active && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute -left-[10px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-400"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </NavLink>
            </SidebarTooltip>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1 pt-2">
        {BOTTOM_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <SidebarTooltip key={item.path} label={item.label}>
              <NavLink
                to={item.path}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-sidebar-accent text-blue-400'
                    : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
                aria-label={item.label}
              >
                {item.icon}
              </NavLink>
            </SidebarTooltip>
          );
        })}

        {/* Divider */}
        <div className="my-2 h-px w-8 bg-sidebar-border" />

        {/* User avatar */}
        <SidebarTooltip label={user ? `${user.firstName} ${user.lastName}` : 'Profile'}>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white shadow-md transition-transform hover:scale-105"
            aria-label="User profile"
          >
            {userInitials}
          </button>
        </SidebarTooltip>
      </div>
    </aside>
  );
}
