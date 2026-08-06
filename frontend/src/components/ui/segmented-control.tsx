// ─────────────────────────────────────────────────────────────────────────────
// src/components/ui/segmented-control.tsx
// iOS-style segmented control. The selected pill is a shared layout element, so
// it slides between options instead of blinking.
// Used by the dashboard period selectors and the Tasks List|Board switch.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Unique across the page — the sliding pill is matched by this id. */
  layoutId: string;
  size?: 'sm' | 'md';
  /** Render icons only, with the label as the accessible name. */
  iconOnly?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  layoutId,
  size = 'sm',
  iconOnly = false,
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/50 p-0.5',
        className
      )}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={iconOnly ? segment.label : undefined}
            title={iconOnly ? segment.label : undefined}
            onClick={() => onChange(segment.value)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-[7px] font-medium',
              'transition-colors duration-150',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
              iconOnly ? (size === 'sm' ? 'w-7' : 'w-8') : 'px-2.5',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ duration: DURATION.normal, ease: EASE_OUT }}
                className="absolute inset-0 rounded-[7px] border border-border/60 bg-card shadow-xs"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {segment.icon}
              {!iconOnly && segment.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
