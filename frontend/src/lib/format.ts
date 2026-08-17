// ─────────────────────────────────────────────────────────────────────────────
// src/lib/format.ts
// Number and date presentation. Formatters are module-level singletons —
// constructing Intl.NumberFormat inside a render is surprisingly expensive and
// the dashboard was doing it eight times per paint.
// ─────────────────────────────────────────────────────────────────────────────
import dayjs from 'dayjs';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const decimal = new Intl.NumberFormat('en-US');

/**
 * Same idea as `usd` but for records that carry their own currency (deals do).
 * Cached per code because a kanban board renders hundreds of these per paint.
 */
const byCurrency = new Map<string, Intl.NumberFormat>();

/** $1,240,000 — full precision, for cards where the exact figure matters. */
export function formatCurrency(value: number | null | undefined): string {
  return usd.format(value ?? 0);
}

/** formatCurrency for a record that stores its own currency code. */
export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  let formatter = byCurrency.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      // Intl throws RangeError on a malformed code. One bad row must not take
      // down a board that renders hundreds of these.
      formatter = usd;
    }
    byCurrency.set(currency, formatter);
  }
  return formatter.format(value ?? 0);
}

/** $1.2M — for tight spaces and axis labels. */
export function formatCompactCurrency(value: number | null | undefined): string {
  return usdCompact.format(value ?? 0);
}

export function formatNumber(value: number | null | undefined): string {
  return decimal.format(value ?? 0);
}

/**
 * Relative day language. Reads the way a person would say it, and falls back to
 * an absolute date once "in N days" stops being useful.
 */
export function formatRelativeDate(raw: string | Date | null | undefined): string {
  if (!raw) return '—';
  const target = dayjs(raw).startOf('day');
  if (!target.isValid()) return '—';

  const days = target.diff(dayjs().startOf('day'), 'day');

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days <= 7) return `In ${days} days`;
  if (days < -1 && days >= -7) return `${Math.abs(days)} days ago`;

  return target.format(target.year() === dayjs().year() ? 'DD MMM' : 'DD MMM YYYY');
}

/** True when a due date has passed — drives the overdue tint. */
export function isOverdue(raw: string | Date | null | undefined): boolean {
  if (!raw) return false;
  const target = dayjs(raw);
  return target.isValid() && target.startOf('day').isBefore(dayjs().startOf('day'));
}
