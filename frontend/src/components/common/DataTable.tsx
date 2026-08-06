// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/DataTable.tsx
// The shared table surface for Leads, Contacts and anything else record-shaped.
//
// Design notes
//  · Separation comes from hairlines (divide-border/50), never from shadows.
//  · Row actions are hidden until hover/focus (Notion pattern) and live in a
//    sticky right cell so they survive horizontal scroll.
//  · Skeletons mirror the real row geometry — avatar block, two text lines,
//    right-aligned numerics — so loading doesn't reflow into content.
//  · Pagination is a range readout plus two icon buttons. No page-number grid.
//
// Every prop that existed before still exists and behaves identically; the new
// ones (rowActions, empty*, density, stickyHeader) are additive and optional.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronsUpDown, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { staggerContainer, staggerItem } from '@/lib/motion';
import Pagination, { type PaginationProps } from '@/components/common/Pagination';

export interface Column<T> {
  key: string;
  header: string;
  accessor?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  /** Hide below the `md` breakpoint to keep narrow screens readable. */
  hideOnMobile?: boolean;
}

// Re-exported so existing `import { PaginationProps } from './DataTable'` holds.
export type { PaginationProps };

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  pagination?: PaginationProps;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectRow?: (id: string) => void;
  onSelectAll?: (selected: boolean) => void;
  sortColumn?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnKey: string) => void;
  emptyMessage?: string;

  // ── Additive ──────────────────────────────────────────────────────────────
  /** Hover-revealed actions, right-aligned. Use `RowAction` for the buttons. */
  rowActions?: (row: T) => React.ReactNode;
  emptyTitle?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
  density?: 'comfortable' | 'compact';
  stickyHeader?: boolean;
  className?: string;
}

// ── Custom checkbox ───────────────────────────────────────────────────────────
// A styled box driven by a visually-hidden native input, so the change events
// the table already relies on are untouched.

function TableCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
}) {
  return (
    <label className="group/cb relative flex h-4 w-4 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={onChange}
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[5px] border border-border bg-background transition-colors duration-150 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      />
      {/* Tick — drawn over the input, pointer-events off so the input owns clicks */}
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className={cn(
          'pointer-events-none relative h-3 w-3 text-primary-foreground transition-opacity duration-150',
          checked && !indeterminate ? 'opacity-100' : 'opacity-0'
        )}
      >
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn(
          'pointer-events-none absolute h-[2px] w-2 rounded-full bg-primary-foreground transition-opacity duration-150',
          indeterminate ? 'opacity-100' : 'opacity-0'
        )}
      />
    </label>
  );
}

// ── Row action button ─────────────────────────────────────────────────────────

/**
 * Icon button for the hover-revealed action rail. Stops propagation so it never
 * fires the row's onRowClick.
 */
export function RowAction({
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'destructive';
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150',
        'focus-visible:opacity-100',
        tone === 'destructive'
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : // `muted`, not `background` — in dark mode `background` is *darker*
            // than the card, so the hover would read as a hole in the row.
            'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {icon}
    </button>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  pagination,
  selectable = false,
  selectedIds = [],
  onSelectRow,
  onSelectAll,
  sortColumn,
  sortOrder,
  onSort,
  emptyMessage = 'No data available',
  rowActions,
  emptyTitle = 'Nothing here yet',
  emptyIcon,
  emptyAction,
  density = 'comfortable',
  stickyHeader = true,
  className,
}: DataTableProps<T>) {
  const allSelected = data.length > 0 && data.every((row) => selectedIds.includes(row.id));
  const isSomeSelected = selectedIds.length > 0 && !allSelected;

  const handleHeaderCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onSelectAll) {
      onSelectAll(e.target.checked);
    }
  };

  const handleRowCheckboxChange = (_e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (onSelectRow) {
      onSelectRow(id);
    }
  };

  const cellPad = density === 'compact' ? 'py-2.5 px-4' : 'py-3 px-4';
  const colSpan = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  const alignOf = (align?: Column<T>['align']) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div
      className={cn(
        'flex flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card',
        className
      )}
    >
      <div className="flex-1 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {selectable && (
                <th
                  className={cn(
                    'w-10 border-b border-border/60 bg-muted/40 py-2.5 pl-4 pr-2',
                    stickyHeader && 'sticky top-0 z-10'
                  )}
                >
                  <TableCheckbox
                    checked={allSelected}
                    indeterminate={isSomeSelected}
                    onChange={handleHeaderCheckboxChange}
                    label="Select all rows"
                  />
                </th>
              )}

              {columns.map((col) => {
                const isSorted = sortColumn === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    aria-sort={
                      isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'whitespace-nowrap border-b border-border/60 bg-muted/40 py-2.5 px-4',
                      'text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                      'select-none',
                      stickyHeader && 'sticky top-0 z-10',
                      alignOf(col.align),
                      col.hideOnMobile && 'hidden md:table-cell',
                      col.sortable && 'cursor-pointer transition-colors hover:text-foreground'
                    )}
                    onClick={() => col.sortable && onSort && onSort(col.key)}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        col.align === 'right'
                          ? 'flex-row-reverse'
                          : col.align === 'center'
                          ? 'justify-center'
                          : ''
                      )}
                    >
                      {col.header}
                      {col.sortable &&
                        (isSorted ? (
                          <ChevronDown
                            size={13}
                            className={cn(
                              'text-primary transition-transform duration-150',
                              sortOrder === 'asc' && 'rotate-180'
                            )}
                          />
                        ) : (
                          <ChevronsUpDown size={13} className="opacity-35" />
                        ))}
                    </span>
                  </th>
                );
              })}

              {rowActions && (
                <th
                  className={cn(
                    'w-px border-b border-border/60 bg-muted/40 py-2.5 pl-2 pr-3',
                    stickyHeader && 'sticky top-0 z-10'
                  )}
                >
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>

          {isLoading ? (
            <tbody>
              {[...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {selectable && (
                    <td className={cn(cellPad, 'border-b border-border/40')}>
                      <div className="h-4 w-4 animate-pulse rounded-[5px] bg-muted" />
                    </td>
                  )}
                  {columns.map((col, ci) => (
                    <td
                      key={col.key}
                      className={cn(
                        cellPad,
                        'border-b border-border/40',
                        col.hideOnMobile && 'hidden md:table-cell'
                      )}
                    >
                      {/* First column carries the avatar + two-line identity block */}
                      {ci === 0 ? (
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                          <div className="space-y-1.5">
                            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                            <div className="h-2.5 w-20 animate-pulse rounded bg-muted/60" />
                          </div>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'h-3 animate-pulse rounded bg-muted',
                            col.align === 'right' ? 'ml-auto w-16' : 'w-24'
                          )}
                        />
                      )}
                    </td>
                  ))}
                  {rowActions && <td className="border-b border-border/40" />}
                </tr>
              ))}
            </tbody>
          ) : data.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={colSpan} className="px-6 py-20">
                  <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                    <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
                      {/* Soft bloom so the empty state reads as designed, not broken */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-2xl bg-primary/5 blur-lg"
                      />
                      <span className="relative">
                        {emptyIcon ?? <Inbox size={22} />}
                      </span>
                    </div>
                    <p className="text-sm font-semibold tracking-tight text-foreground">
                      {emptyTitle}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {emptyMessage}
                    </p>
                    {emptyAction && <div className="mt-5">{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            <motion.tbody
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              key={`${pagination?.page ?? 0}-${sortColumn}-${sortOrder}`}
            >
              {data.map((row) => {
                const isSelected = selectedIds.includes(row.id);
                return (
                  <motion.tr
                    key={row.id}
                    variants={staggerItem}
                    onClick={() => onRowClick && onRowClick(row)}
                    data-selected={isSelected || undefined}
                    className={cn(
                      'group transition-colors duration-150',
                      onRowClick && 'cursor-pointer',
                      isSelected ? 'bg-primary/[0.06]' : 'hover:bg-muted/40'
                    )}
                  >
                    {selectable && (
                      <td
                        className={cn(cellPad, 'border-b border-border/40 pr-2')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TableCheckbox
                          checked={isSelected}
                          onChange={(e) => handleRowCheckboxChange(e, row.id)}
                          label="Select row"
                        />
                      </td>
                    )}

                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          cellPad,
                          'border-b border-border/40 align-middle',
                          alignOf(col.align),
                          col.hideOnMobile && 'hidden md:table-cell'
                        )}
                      >
                        {col.accessor ? col.accessor(row) : ((row as any)[col.key] ?? '—')}
                      </td>
                    ))}

                    {rowActions && (
                      // Deliberately not sticky: an opaque pinned cell has to
                      // re-create the row's hover/selected background exactly,
                      // and any mismatch shows as a seam. Columns that would
                      // force horizontal scroll are marked `hideOnMobile`
                      // instead, so the rail stays in view without the hack.
                      <td
                        className="w-px border-b border-border/40 py-1 pl-2 pr-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="row-actions flex items-center justify-end gap-0.5">
                          {rowActions(row)}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </motion.tbody>
          )}
        </table>
      </div>

      {pagination && (
        <Pagination {...pagination} className="border-t border-border/60 px-4 py-2.5" />
      )}
    </div>
  );
}
