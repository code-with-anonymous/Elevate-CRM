// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/Pagination.tsx
// Minimal pager: a range readout plus prev/next. No numbered page grid — with
// hundreds of records those buttons are noise nobody aims at.
//
// Single implementation shared by DataTable and the Contacts grid, so the two
// views of the same data can't drift apart.
// ─────────────────────────────────────────────────────────────────────────────
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  className,
}: PaginationProps & { className?: string }) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <p className="text-xs text-muted-foreground">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            Showing{' '}
            <span className="font-medium tabular-nums text-foreground">
              {from}–{to}
            </span>{' '}
            of <span className="font-medium tabular-nums text-foreground">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-1">
        <span className="mr-1 hidden text-xs tabular-nums text-muted-foreground sm:inline">
          Page {page} / {totalPages || 1}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
