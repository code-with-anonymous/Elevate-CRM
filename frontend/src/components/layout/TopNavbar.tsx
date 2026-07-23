// ─────────────────────────────────────────────────────────────────────────────
// src/components/layout/TopNavbar.tsx
// Horizontal top navbar — tabs, search, notifications, avatar, CTA
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bell,
  Plus,
  ChevronDown,
  LogOut,
  Settings,
  User,
  X,
} from 'lucide-react';
import { ROUTES } from '@/constants';
import { useAuthStore } from '@/store/authStore';
import { useLogout } from '@/hooks/useAuthActions';
import AddLeadDrawer from '@/components/leads/AddLeadDrawer';

// ── Tab definitions ───────────────────────────────────────────────────────────

interface NavTab {
  label: string;
  path: string;
}

const TABS: NavTab[] = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD },
  { label: 'Leads', path: ROUTES.LEADS },
  { label: 'Pipeline', path: ROUTES.DEALS },
  { label: 'Contacts', path: ROUTES.CONTACTS },
  { label: 'Tasks', path: ROUTES.TASKS },
];

// ── Date formatter ────────────────────────────────────────────────────────────

function getDateRange(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${formatter.format(start)} – ${formatter.format(now)}`;
}

// ── Avatar dropdown ───────────────────────────────────────────────────────────

function AvatarDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const { logout } = useLogout();
  const navigate = useNavigate();

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U';

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-1 py-1 pr-3 transition-colors hover:bg-muted"
        aria-label="User menu"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white">
          {initials}
        </div>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-border bg-card p-1.5 shadow-lg"
          >
            {/* User info */}
            <div className="border-b border-border px-3 py-2.5 mb-1">
              <p className="text-sm font-semibold text-foreground">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(ROUTES.SETTINGS.PROFILE);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <User size={15} className="text-muted-foreground" />
              Profile
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(ROUTES.SETTINGS.ROOT);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Settings size={15} className="text-muted-foreground" />
              Settings
            </button>

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── TopNavbar component ───────────────────────────────────────────────────────

export default function TopNavbar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/80 backdrop-blur-md px-6">
      {/* Left: Navigation tabs */}
      <nav className="flex items-center gap-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="navbar-tab-underline"
                    className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-blue-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Date range */}
        <span className="hidden lg:block mr-2 text-xs text-muted-foreground font-medium">
          {getDateRange()}
        </span>

        {/* Search */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <input
                ref={searchRef}
                type="text"
                placeholder="Search..."
                className="h-8 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                onBlur={() => setSearchOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Search (Ctrl+K)"
        >
          {searchOpen ? <X size={16} /> : <Search size={16} />}
        </button>

        {/* Notifications */}
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell size={16} />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white ring-2 ring-card">
            3
          </span>
        </button>

        {/* Add Lead CTA */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-blue-500 px-3.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 hover:shadow-md active:scale-[0.97]"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Add Lead</span>
        </button>

        {/* Avatar dropdown */}
        <AvatarDropdown />
      </div>

      {/* Slide from right Drawer */}
      <AddLeadDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
