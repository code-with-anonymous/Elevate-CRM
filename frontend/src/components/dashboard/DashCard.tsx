// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/DashCard.tsx
// The dashboard's card vocabulary — shell, header, metric, delta pill and
// skeleton. Every card composes these so padding, type scale and hover
// behaviour stay identical across the grid.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

// ── Shell ─────────────────────────────────────────────────────────────────────

interface DashCardProps {
  children: ReactNode;
  /** `hero` swaps the flat surface for the accent bloom. Use once per screen. */
  variant?: 'default' | 'hero';
  /** Lift on hover. Off for static readouts that aren't clickable. */
  interactive?: boolean;
  className?: string;
}

export function DashCard({
  children,
  variant = 'default',
  interactive = false,
  className,
}: DashCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card',
        'transition-[box-shadow,border-color] duration-200 ease-out',
        variant === 'hero' && 'accent-glow border-primary/20',
        interactive && 'hover:border-border hover:shadow-md',
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

interface DashCardHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-hand slot — segmented control, link, menu. */
  action?: ReactNode;
  /** Small square glyph tile before the title. */
  icon?: ReactNode;
  className?: string;
}

export function DashCardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: DashCardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Metric ────────────────────────────────────────────────────────────────────

/**
 * The number is the point of a metric card, so it gets size, weight and tight
 * tracking — and `tabular-nums` so it never jitters between refetches.
 */
export function Metric({
  value,
  size = 'md',
  className,
}: {
  value: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'block font-semibold tabular-nums text-foreground',
        size === 'lg' ? 'text-[32px] leading-[1.1] tracking-tighter' : 'text-[26px] leading-[1.15] tracking-tight',
        className
      )}
    >
      {value}
    </span>
  );
}

export function MetricLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

// ── Delta pill ────────────────────────────────────────────────────────────────

/**
 * Direction reads from the arrow first and the color second, so it survives
 * being viewed by someone who can't separate the two hues.
 */
export function DeltaPill({
  value,
  suffix = '%',
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const flat = value === 0;
  const positive = value > 0;
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5',
        'text-[11px] font-medium tabular-nums ring-1 ring-inset',
        flat
          ? 'bg-status-neutral/10 text-status-neutral ring-status-neutral/20'
          : positive
          ? 'bg-status-positive/10 text-status-positive ring-status-positive/20'
          : 'bg-status-negative/10 text-status-negative ring-status-negative/20',
        className
      )}
    >
      <Icon size={11} />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

/**
 * Loading states mirror the real card geometry — same shell, same header
 * position, same block sizes — so nothing jumps when data lands.
 */
export function DashCardSkeleton({
  className,
  lines = 2,
  showChart = false,
}: {
  className?: string;
  lines?: number;
  showChart?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-card p-5',
        className
      )}
    >
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted/60" />
      </div>
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded bg-muted"
          style={{ width: `${70 - i * 18}%` }}
        />
      ))}
      {showChart && (
        <div className="mt-auto flex-1 animate-pulse rounded-lg bg-muted/50" />
      )}
    </div>
  );
}
