// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/TaskCheckbox.tsx
// Completion control. The tick draws itself in rather than popping — a 180ms
// stroke-dash sweep, which is the one place a little delight is warranted
// because the user just did something.
//
// It's a real <button> with aria-pressed, so keyboard and screen-reader users
// get the same affordance as the mouse.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { EASE_OUT } from '@/lib/motion';

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export default function TaskCheckbox({
  checked,
  onToggle,
  size = 'md',
  className,
}: TaskCheckboxProps) {
  const box = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]';

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? 'Mark incomplete' : 'Mark complete'}
      title={checked ? 'Mark incomplete' : 'Mark complete'}
      onClick={onToggle}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[6px] border',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        box,
        checked
          ? 'border-status-positive bg-status-positive text-white'
          : 'border-border bg-background hover:border-status-positive/60',
        className
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'}
      >
        <motion.path
          d="M3 8.5 6.5 12 13 4.5"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
        />
      </svg>
    </button>
  );
}
