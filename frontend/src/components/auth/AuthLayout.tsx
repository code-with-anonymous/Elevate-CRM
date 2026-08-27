// ─────────────────────────────────────────────────────────────────────────────
// src/components/auth/AuthLayout.tsx
// Centered card layout used by all authentication pages
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@lib/cn';
import { APP_NAME } from '@constants/index';
import { LogoMark } from '@components/common/Logo';

export interface AuthLayoutProps {
  children: ReactNode;
  /** Optional subtitle shown below the logo */
  subtitle?: string;
  /** Max width of the card (default: max-w-md) */
  maxWidth?: 'sm' | 'md' | 'lg';
  /** Whether to show the logo */
  showLogo?: boolean;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
} as const;

/**
 * Shared layout wrapper for all auth pages.
 * Provides the gradient background + centered card.
 */
function AuthLayout({
  children,
  subtitle,
  maxWidth = 'md',
  showLogo = true,
}: AuthLayoutProps): React.JSX.Element {
  return (
    <div className="auth-bg flex min-h-screen flex-col items-center justify-center p-4">
      {/* Background decorative orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className={cn('relative z-10 w-full', maxWidthMap[maxWidth])}
      >
        {/* Logo */}
        {showLogo && (
          <div className="mb-8 flex flex-col items-center">
            {/* Mark + text rather than the full wordmark: the lockup's type is
                dark navy, which disappears against the dark card in dark theme.
                The plated mark reads on both, and APP_NAME below carries the
                name in the theme's own foreground colour. */}
            <LogoMark size={56} className="mb-4 shadow-lg" />
            <span className="text-xl font-semibold tracking-tight text-foreground">
              {APP_NAME}
            </span>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          {children}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}

AuthLayout.displayName = 'AuthLayout';

export default AuthLayout;
