// ─────────────────────────────────────────────────────────────────────────────
// src/components/layout/DashboardLayout.tsx
// App shell — icon rail + chrome bar + content well.
// The rail collapses away below `md`; the navbar tabs carry navigation there.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { Button } from '@/components/ui/button';
import Sidebar from './Sidebar';
import TopNavbar from './TopNavbar';

export interface DashboardLayoutProps {
  children?: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { showWarning, timeRemaining, extendSession } = useSessionTimeout();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      {/* Offset by the rail only once the rail exists */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-[68px]">
        <TopNavbar />

        {/* The single page gutter — pages should not add their own outer padding */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border/60 bg-card p-6 shadow-pop">
            <h3 className="mb-1.5 text-base font-semibold tracking-tight text-foreground">
              Session expiring soon
            </h3>
            <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
              You'll be signed out in{' '}
              <span className="font-medium tabular-nums text-foreground">
                {timeRemaining}
              </span>{' '}
              seconds due to inactivity.
            </p>
            <Button className="w-full" onClick={extendSession}>
              Stay signed in
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
