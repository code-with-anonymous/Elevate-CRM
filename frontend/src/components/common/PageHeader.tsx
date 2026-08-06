// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/PageHeader.tsx
// One header treatment for every record page. Title carries tight tracking, the
// count sits beside it as a quiet chip rather than a colored badge, and there's
// a generous gap before content (mb-8, per the spacing rules).
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Rendered as a chip next to the title. Omitted while undefined/loading. */
  count?: number;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  count,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, ease: EASE_OUT }}
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {count !== undefined && (
            <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
