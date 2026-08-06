// ─────────────────────────────────────────────────────────────────────────────
// src/components/ui/field.tsx
// Form field chrome shared by the lead drawer and the contact modal, so inputs
// stop drifting apart across surfaces.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Base control styling. Hairline at rest, accent ring on focus. */
export const controlClass =
  'h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground ' +
  'placeholder:text-muted-foreground outline-none transition-colors duration-150 ' +
  'hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** Native selects need extra right padding for the platform chevron. */
export const selectClass = cn(controlClass, 'cursor-pointer pr-8');

export const errorControlClass =
  'border-destructive/60 focus:border-destructive focus:ring-destructive/15';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default Field;
