// ─────────────────────────────────────────────────────────────────────────────
// pages/settings/SettingsSection.tsx
// The card every settings block sits in: title, optional description, body, and
// an optional footer rail for the save button.
//
// Extracted rather than repeated so the five tabs can't drift apart on padding
// or on where the primary action lives — settings pages are where inconsistency
// is most visible, because you see four of them in a row.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Right-aligned footer rail — usually the save button. */
  footer?: ReactNode;
  /** Left-hand slot in the footer, for "last saved" style hints. */
  footerHint?: ReactNode;
  /** Destructive framing: red hairline and tinted header. */
  tone?: 'default' | 'danger';
  className?: string;
}

export default function SettingsSection({
  title,
  description,
  children,
  footer,
  footerHint,
  tone = 'default',
  className,
}: SettingsSectionProps) {
  const danger = tone === 'danger';

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-card',
        danger ? 'border-destructive/30' : 'border-border/60',
        className
      )}
    >
      <header className="border-b border-border/60 px-5 py-4">
        <h2
          className={cn(
            'flex items-center gap-2 text-[13px] font-semibold tracking-tight',
            danger ? 'text-destructive' : 'text-foreground'
          )}
        >
          {danger && <AlertTriangle size={14} className="shrink-0" />}
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        )}
      </header>

      <div className="px-5 py-5">{children}</div>

      {(footer || footerHint) && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/25 px-5 py-3">
          <span className="text-[11px] text-muted-foreground">{footerHint}</span>
          {footer && <div className="flex items-center gap-2">{footer}</div>}
        </footer>
      )}
    </section>
  );
}
