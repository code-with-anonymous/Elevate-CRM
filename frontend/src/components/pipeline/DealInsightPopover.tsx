// ─────────────────────────────────────────────────────────────────────────────
// src/components/pipeline/DealInsightPopover.tsx
// The hover panel under a kanban card. Numbers come from lib/dealInsight.ts;
// this file only decides how they look.
//
// Two structural choices worth keeping:
//
//   1. It PORTALS to document.body and positions itself `fixed`. The board scrolls
//      horizontally (`overflow-x-auto`), which makes the column an overflow
//      container — an absolutely-positioned panel would be clipped at the card's
//      bottom edge or add a scrollbar. A portal has no such ancestor.
//
//   2. It never participates in layout. Expanding the card inline would push
//      every card below it down, so the card under the cursor changes and the
//      panel flickers — the classic hover-to-expand kanban bug.
//
// It is also pointer-events-none throughout: the panel can never swallow a click
// meant for the card, and it cannot interrupt a dnd-kit drag.
// ─────────────────────────────────────────────────────────────────────────────
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CalendarClock, Clock, Gauge, TrendingUp } from 'lucide-react';

import type { Deal } from '@services/api/dealService';
import { getDealInsight, OPEN_STAGES, type SignalTone } from '@/lib/dealInsight';
import { formatMoney } from '@/lib/format';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/cn';

const PANEL_WIDTH = 248;
/** Gap between the card edge and the panel. */
const OFFSET = 8;
/** Below this much room underneath, the panel flips above the card. */
const ESTIMATED_HEIGHT = 190;

const TONE_CLASS: Record<SignalTone, string> = {
  positive: 'bg-status-positive/10 text-status-positive ring-status-positive/20',
  warn: 'bg-status-warn/10 text-status-warn ring-status-warn/20',
  negative: 'bg-status-negative/10 text-status-negative ring-status-negative/20',
  neutral: 'bg-muted text-muted-foreground ring-border/60',
};

interface DealInsightPopoverProps {
  deal: Deal;
  /** Viewport rect of the card this is anchored to. */
  anchor: DOMRect;
}

/** One label/value line. */
function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'negative' | 'warn';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'text-[11px] font-medium tabular-nums',
          tone === 'negative' && 'text-status-negative',
          tone === 'warn' && 'text-status-warn',
          !tone && 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function DealInsightPopover({ deal, anchor }: DealInsightPopoverProps) {
  const insight = getDealInsight(deal);

  // Read straight from the viewport rather than holding it in state: the panel
  // is mounted on open and unmounted on scroll/resize (see DealCard), so these
  // can never go stale while it is on screen.
  const viewport = { width: window.innerWidth, height: window.innerHeight };

  const flipAbove = anchor.bottom + OFFSET + ESTIMATED_HEIGHT > viewport.height;
  const top = flipAbove ? anchor.top - OFFSET : anchor.bottom + OFFSET;

  // Prefer left-aligned with the card, but never let the panel leave the viewport
  // — the right-hand columns of a wide board would otherwise render off-screen.
  const left = Math.min(
    Math.max(8, anchor.left),
    Math.max(8, viewport.width - PANEL_WIDTH - 8)
  );

  const closeLabel =
    insight.daysToClose === null
      ? 'Not set'
      : insight.daysToClose < 0
        ? `${Math.abs(insight.daysToClose)}d overdue`
        : insight.daysToClose === 0
          ? 'Today'
          : `${insight.daysToClose}d away`;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: flipAbove ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: flipAbove ? 4 : -4 }}
      transition={{ duration: DURATION.fast, ease: EASE_OUT }}
      role="tooltip"
      aria-hidden
      style={{
        top,
        left,
        width: PANEL_WIDTH,
        // Anchoring by the bottom edge when flipped keeps the panel glued to the
        // card regardless of how tall its signal list turns out to be.
        transform: flipAbove ? 'translateY(-100%)' : undefined,
      }}
      className="pointer-events-none fixed z-[60] rounded-lg border border-border/60 bg-popover p-3 shadow-pop"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Pipeline insight
      </p>

      {/* Funnel position — segments fill up to the current stage */}
      {!insight.isClosed && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{deal.stage}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {insight.stageIndex + 1} of {insight.stageCount}
            </span>
          </div>
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {OPEN_STAGES.map((stage, i) => (
              <span
                key={stage}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  i <= insight.stageIndex ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
        <Row
          icon={<TrendingUp size={11} />}
          label={`Weighted @ ${Math.round(insight.probability * 100)}%`}
          value={formatMoney(insight.weightedValue, deal.currency)}
        />
        <Row
          icon={<CalendarClock size={11} />}
          label="Expected close"
          value={closeLabel}
          tone={insight.daysToClose !== null && insight.daysToClose < 0 ? 'negative' : undefined}
        />
        <Row
          icon={<Clock size={11} />}
          label="Last activity"
          value={insight.idleDays === 0 ? 'Today' : `${insight.idleDays}d ago`}
          tone={insight.idleDays >= 14 ? 'warn' : undefined}
        />
        <Row
          icon={<Gauge size={11} />}
          label="Age in pipeline"
          value={insight.ageDays === 0 ? 'Today' : `${insight.ageDays}d`}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-border/50 pt-2.5">
        {insight.signals.map((s) => (
          <span
            key={s.key}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
              TONE_CLASS[s.tone]
            )}
          >
            {s.label}
          </span>
        ))}
      </div>
    </motion.div>,
    document.body
  );
}
