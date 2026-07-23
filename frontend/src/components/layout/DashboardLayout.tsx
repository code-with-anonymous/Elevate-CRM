// ─────────────────────────────────────────────────────────────────────────────
// src/components/layout/DashboardLayout.tsx
// Full dashboard shell — Sidebar + TopNavbar + main content area
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { useAuthActions } from '@/hooks/useAuthActions';
import { useAuth } from '@/hooks/useAuth';
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
      {/* Fixed sidebar */}
      <Sidebar />

      {/* Main area — offset by sidebar width */}
      <div className="flex flex-1 flex-col pl-[68px]">
        {/* Sticky top navbar */}
        <TopNavbar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </main>
      </div>

      {/* Session timeout warning modal */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Session Expiring Soon
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Your session will expire in {timeRemaining} seconds due to inactivity.
            </p>
            <Button className="w-full" onClick={extendSession}>
              Stay Logged In
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
