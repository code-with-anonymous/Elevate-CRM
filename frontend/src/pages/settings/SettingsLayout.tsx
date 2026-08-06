// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/SettingsLayout.tsx
// Persistent left-hand nav with an <Outlet /> for the active tab. Each tab is a
// real route (/settings/profile, /settings/team, …) rather than local state, so
// a tab is linkable, survives reload, and the back button works.
//
// Left nav rather than top tabs: the list grows (five now, more with Billing),
// and vertical lists absorb growth without wrapping or truncating.
// ─────────────────────────────────────────────────────────────────────────────
import { NavLink, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Bell, Building2, Shield, User, Users } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/cn';
import { pageVariants } from '@/lib/motion';

interface TabDef {
  to: string;
  label: string;
  description: string;
  icon: typeof User;
  /** Lowercase roles allowed to see the tab. Omit for everyone. */
  roles?: string[];
}

const TABS: TabDef[] = [
  { to: '/settings/profile', label: 'Profile', description: 'Your name, email, and avatar', icon: User },
  {
    to: '/settings/organization',
    label: 'Organization',
    description: 'Name, logo, and defaults',
    icon: Building2,
    // Read is open server-side, but every control on the page is a write, so a
    // member would land on a page of disabled inputs. Hide it instead.
    roles: ['owner', 'admin'],
  },
  {
    to: '/settings/team',
    label: 'Team',
    description: 'Members, roles, and invitations',
    icon: Users,
  },
  { to: '/settings/security', label: 'Security', description: '2FA, sessions, and history', icon: Shield },
  {
    to: '/settings/notifications',
    label: 'Notifications',
    description: 'What reaches your inbox',
    icon: Bell,
  },
];

export default function SettingsLayout() {
  // user.role is the raw server value (lowercase). authStore.role is the
  // normalized enum — either works here, but comparing lowercase to lowercase
  // avoids relying on the normalization.
  const user = useAuthStore((s) => s.user);
  const role = String(user?.role ?? '').toLowerCase();

  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <>
      <Helmet>
        <title>Settings — ElevateCRM</title>
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-[1200px] flex-col"
      >
        <PageHeader
          title="Settings"
          description="Your account, your organisation, and who can do what."
          className="mb-8"
        />

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Nav — horizontal scroller on mobile, sticky rail from lg up */}
          <nav
            aria-label="Settings sections"
            className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:w-56 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    cn(
                      'group flex shrink-0 items-start gap-2.5 rounded-lg px-3 py-2.5 text-left',
                      'transition-colors duration-150 ease-out',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      isActive
                        ? 'bg-primary/[0.07] text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={15}
                        className={cn('mt-0.5 shrink-0', isActive && 'text-primary')}
                      />
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap text-[13px] font-medium">
                          {tab.label}
                        </span>
                        {/* Descriptions only from lg up — on a horizontal
                            mobile scroller they'd make each pill enormous. */}
                        <span className="hidden text-[11px] text-muted-foreground lg:block">
                          {tab.description}
                        </span>
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </motion.div>
    </>
  );
}
