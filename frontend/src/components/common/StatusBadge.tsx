// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/StatusBadge.tsx
// Dot + label pill. Fill sits at 10% of the status hue with a 20% hairline ring
// — enough to read as a state, quiet enough to sit in a dense table.
//
// The `variantMap` escape hatch is unchanged, so existing call sites that pass
// their own dotClass/badgeClass keep working exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import { cn } from '@/lib/cn';

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'warn'
  | 'progress'
  | 'positive'
  | 'negative'
  | 'accent';

interface StatusBadgeProps {
  status: string;
  variantMap?: Record<string, { dotClass: string; badgeClass?: string }>;
  /** Force a tone instead of inferring it from `status`. */
  tone?: StatusTone;
  size?: 'sm' | 'md';
  /** Hide the leading dot (useful inside already-colored surfaces). */
  hideDot?: boolean;
  className?: string;
}

/** Solid hue — dots, kanban column accents, chart series. */
export const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
  warn: 'bg-status-warn',
  progress: 'bg-status-progress',
  positive: 'bg-status-positive',
  negative: 'bg-status-negative',
  accent: 'bg-status-accent',
};

/** Text-only hue — for numbers and inline labels. */
export const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-status-neutral',
  info: 'text-status-info',
  warn: 'text-status-warn',
  progress: 'text-status-progress',
  positive: 'text-status-positive',
  negative: 'text-status-negative',
  accent: 'text-status-accent',
};

/** 10% fill + 20% ring — the pill treatment. */
export const TONE_PILL: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral/10 text-status-neutral ring-status-neutral/20',
  info: 'bg-status-info/10 text-status-info ring-status-info/20',
  warn: 'bg-status-warn/10 text-status-warn ring-status-warn/20',
  progress: 'bg-status-progress/10 text-status-progress ring-status-progress/20',
  positive: 'bg-status-positive/10 text-status-positive ring-status-positive/20',
  negative: 'bg-status-negative/10 text-status-negative ring-status-negative/20',
  accent: 'bg-status-accent/10 text-status-accent ring-status-accent/20',
};

/**
 * Every status string the app produces, mapped to a tone. Unknown values fall
 * back to `neutral` rather than inventing a color.
 */
export const STATUS_TONES: Record<string, StatusTone> = {
  // Lead / deal pipeline
  New: 'info',
  Contacted: 'warn',
  Qualified: 'accent',
  Proposal: 'progress',
  'Proposal Sent': 'progress',
  Negotiation: 'warn',
  Won: 'positive',
  Lost: 'negative',
  // Task states
  Open: 'info',
  Todo: 'neutral',
  'To Do': 'neutral',
  'In Progress': 'warn',
  Done: 'positive',
  Completed: 'positive',
  Blocked: 'negative',
  // Priority
  High: 'negative',
  Urgent: 'negative',
  Medium: 'warn',
  Low: 'positive',
  // Contact lifecycle
  Active: 'positive',
  Inactive: 'neutral',
  Churned: 'negative',
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONES[status] ?? 'neutral';
}

export default function StatusBadge({
  status,
  variantMap,
  tone,
  size = 'md',
  hideDot = false,
  className = '',
}: StatusBadgeProps) {
  const override = variantMap?.[status];
  const resolvedTone = tone ?? toneForStatus(status);

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'gap-1.5 px-2 py-0.5 text-[11px]' : 'gap-1.5 px-2.5 py-1 text-xs',
        override?.badgeClass ?? TONE_PILL[resolvedTone],
        override?.badgeClass && 'ring-transparent',
        className
      )}
    >
      {!hideDot && (
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            override?.dotClass ?? TONE_DOT[resolvedTone]
          )}
        />
      )}
      {status}
    </span>
  );
}
