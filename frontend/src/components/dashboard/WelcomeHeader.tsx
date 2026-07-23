// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/WelcomeHeader.tsx
// Displays the welcome message and date range for the dashboard
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';

export default function WelcomeHeader() {
  const { user } = useAuth();
  const firstName = user?.firstName || 'There';

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const dateRange = `${formatter.format(start)} – ${formatter.format(now)}`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome Back, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Here's what's happening with your pipeline today.
        </p>
      </div>
      <div className="lg:hidden text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md self-start sm:self-auto border border-border/50">
        {dateRange}
      </div>
    </motion.div>
  );
}
