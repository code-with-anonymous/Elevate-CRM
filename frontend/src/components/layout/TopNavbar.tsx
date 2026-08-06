// ─────────────────────────────────────────────────────────────────────────────
// src/components/layout/TopNavbar.tsx
// Chrome bar — tabs, ⌘K search, date range, notifications, theme, avatar, CTA.
// All stores, mutations and keyboard wiring are unchanged; this is the visual
// pass: 1.5px underline that slides, hairline-bounded popovers, token colors.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { ROUTES } from '@/constants';
import { useAuthStore } from '@/store/authStore';
import { useLogout } from '@/hooks/useAuthActions';
import { useNotificationStore } from '@/store/notificationStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT, popoverVariants } from '@/lib/motion';
import AddLeadDrawer from '@/components/leads/AddLeadDrawer';
import CommandPalette from '@/components/common/CommandPalette';

// ── Tab definitions ───────────────────────────────────────────────────────────

interface NavTab {
  label: string;
  path: string;
}

const TABS: NavTab[] = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD },
  { label: 'Leads', path: ROUTES.LEADS },
  { label: 'Pipeline', path: '/pipeline' },
  { label: 'Contacts', path: ROUTES.CONTACTS },
  { label: 'Tasks', path: ROUTES.TASKS },
];

// ── Shared popover shell ──────────────────────────────────────────────────────

const POPOVER_SHELL =
  'absolute right-0 top-full z-50 mt-2 origin-top-right rounded-xl border border-border/60 bg-popover p-1.5 shadow-pop';

// ── Date range selector ───────────────────────────────────────────────────────

function DateRangeSelector() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const { setDateRange } = useDashboardStore();
  const [selectedLabel, setSelectedLabel] = useState('All Time');

  const options = [
    { label: 'All Time', from: '', to: '' },
    {
      label: 'Last 30 Days',
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
    },
    {
      label: 'This Quarter',
      from: new Date(
        new Date().getFullYear(),
        Math.floor(new Date().getMonth() / 3) * 3,
        1
      ).toISOString(),
      to: new Date().toISOString(),
    },
    {
      label: 'This Year',
      from: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      to: new Date().toISOString(),
    },
  ];

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted/60 hover:text-foreground"
      >
        <CalendarIcon size={13} />
        <span>{selectedLabel}</span>
        <ChevronDown
          size={12}
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={popoverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(POPOVER_SHELL, 'w-44')}
          >
            {options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  setSelectedLabel(opt.label);
                  setDateRange({ from: opt.from, to: opt.to });
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] text-foreground transition-colors duration-150 hover:bg-muted"
              >
                <span>{opt.label}</span>
                {selectedLabel === opt.label && <Check size={13} className="text-primary" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const { notifications, unreadCount, markAllAsRead } = useNotificationStore();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-card" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={popoverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(POPOVER_SHELL, 'w-80 p-2')}
          >
            <div className="mb-1 flex items-center justify-between px-1.5 py-1">
              <h4 className="text-xs font-semibold tracking-tight text-foreground">
                Notifications
              </h4>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] font-medium text-primary transition-opacity duration-150 hover:opacity-75"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-1.5 py-8 text-center text-xs text-muted-foreground">
                  You're all caught up.
                </p>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 rounded-lg p-2 transition-colors duration-150 hover:bg-muted/60"
                  >
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: item.avatarColor || 'hsl(var(--avatar-1))' }}
                    >
                      {item.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug text-foreground">{item.title}</p>
                      <span className="text-[10px] text-muted-foreground">{item.timeAgo}</span>
                    </div>
                    {!item.read && (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Avatar dropdown ───────────────────────────────────────────────────────────

function AvatarDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const user = useAuthStore((s) => s.user);
  const { logout } = useLogout();
  const navigate = useNavigate();

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U';

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground transition-colors duration-150 hover:bg-muted';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors duration-150 hover:bg-muted"
        aria-label="User menu"
      >
        <div className="accent-gradient flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white">
          {initials}
        </div>
        <ChevronDown
          size={13}
          className={cn(
            'text-muted-foreground transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={popoverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(POPOVER_SHELL, 'w-56')}
          >
            <div className="mb-1 border-b border-border/60 px-2.5 pb-2.5 pt-1.5">
              <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(ROUTES.SETTINGS.PROFILE);
              }}
              className={itemClass}
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
              className={itemClass}
            >
              <Settings size={15} className="text-muted-foreground" />
              Settings
            </button>

            <div className="my-1 h-px bg-border/60" />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-destructive transition-colors duration-150 hover:bg-destructive/10"
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

// ── Theme toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? 'moon' : 'sun'}
          initial={{ opacity: 0, rotate: -35, scale: 0.85 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 35, scale: 0.85 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
          className="flex"
        >
          {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

// ── TopNavbar ─────────────────────────────────────────────────────────────────

export default function TopNavbar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ⌘K/Ctrl-K opens the palette. Escape is handled INSIDE CommandPalette now,
  // not here — a window-level Escape listener would also close the palette when
  // the user meant to dismiss a popover layered above it.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 backdrop-blur-xl backdrop-saturate-150 sm:px-6">
      {/* Tabs — scroll horizontally on narrow screens rather than wrapping */}
      <nav className="no-scrollbar -mx-1 flex h-full min-w-0 items-center gap-0.5 overflow-x-auto px-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              cn(
                'relative flex h-full shrink-0 items-center rounded-md px-2.5 text-[13px] font-medium',
                'transition-colors duration-150',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {tab.label}
                {isActive && (
                  <motion.span
                    layoutId="navbar-tab-underline"
                    transition={{ duration: DURATION.normal, ease: EASE_OUT }}
                    className="absolute inset-x-1 -bottom-px h-[1.5px] rounded-full bg-primary"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <DateRangeSelector />

        {/* Search — a trigger only. The expanding inline field this replaced
            accepted text and did nothing with it; the palette actually queries
            /api/search and navigates. */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-8 items-center gap-2 rounded-lg border border-border/60 bg-muted/40 pl-2.5 pr-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted sm:flex"
        >
          <Search size={14} />
          <span className="hidden lg:inline">Search…</span>
          <kbd className="kbd ml-2 hidden lg:inline-flex">⌘K</kbd>
        </button>

        {/* Compact search for narrow viewports */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground sm:hidden"
          aria-label="Search"
        >
          <Search size={16} />
        </button>

        <ThemeToggle />
        <NotificationPopover />

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="ml-0.5 flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-primary/90"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Add Lead</span>
        </button>

        <AvatarDropdown />
      </div>

      <AddLeadDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
