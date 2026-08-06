// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/TagChip.tsx
// Freeform label chip. Muted by default — tags are metadata, not status, so
// they must not compete with StatusBadge in the same row.
// ─────────────────────────────────────────────────────────────────────────────
import { cn } from '@/lib/cn';

export function TagChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[9rem] items-center truncate rounded-md border border-border/60',
        'bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground',
        className
      )}
    >
      {label}
    </span>
  );
}

/**
 * Renders a tag list, collapsing the overflow into a "+N" chip so a contact
 * with a dozen tags can't blow out its row height.
 */
export function TagList({
  tags,
  max = 3,
  className,
}: {
  tags?: string[] | null;
  max?: number;
  className?: string;
}) {
  if (!tags || tags.length === 0) {
    return <span className="text-[13px] text-muted-foreground">—</span>;
  }

  const visible = tags.slice(0, max);
  const overflow = tags.length - visible.length;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map((tag, i) => (
        <TagChip key={`${tag}-${i}`} label={tag} />
      ))}
      {overflow > 0 && (
        <span
          title={tags.slice(max).join(', ')}
          className="inline-flex items-center rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

export default TagChip;
