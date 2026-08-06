// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/WelcomeHeader.tsx
// Page header. Bigger tracking-tight title, more air beneath it, and the date
// range as a hairline chip rather than a filled block.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import { CalendarRange } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DURATION, EASE_OUT } from '@/lib/motion';

const formatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function WelcomeHeader() {
  const { user } = useAuth();
  const firstName = user?.firstName || 'there';

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dateRange = `${formatter.format(start)} – ${formatter.format(now)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, ease: EASE_OUT }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
          {greeting(now.getHours())}, {firstName}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Here's what's happening with your pipeline today.
        </p>
      </div>

      <div className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border/60 px-2.5 py-1.5 text-xs tabular-nums text-muted-foreground sm:self-auto lg:hidden">
        <CalendarRange size={13} />
        {dateRange}
      </div>
    </motion.div>
  );
}
