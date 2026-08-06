// ─────────────────────────────────────────────────────────────────────────────
// src/lib/csv.ts
// Client-side CSV export. No backend endpoint — the rows are already in memory
// from the report query, so round-tripping to the server would only add latency
// and a second place for the column list to drift out of sync.
// ─────────────────────────────────────────────────────────────────────────────

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Escape one field per RFC 4180: wrap in quotes when it contains a comma,
 * quote, or newline, and double any embedded quotes.
 *
 * The leading-character guard is deliberate. Excel treats a cell starting with
 * = + - @ as a formula, so a lead named `=cmd|...` becomes a live formula when
 * the export is opened — CSV injection. Prefixing a tab neutralises it while
 * still displaying the original text.
 */
function escapeField(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let value = String(raw);

  if (/^[=+\-@\t\r]/.test(value)) {
    value = `\t${value}`;
  }
  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeField(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeField(c.value(row))).join(','));
  return [head, ...body].join('\r\n');
}

/**
 * Trigger a browser download for a CSV string.
 *
 * The BOM matters: without it Excel decodes the file as the system codepage and
 * mangles any non-ASCII name. The object URL is revoked on the next tick —
 * revoking synchronously can cancel the download in Safari.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `sales-performance-2026-08-06.csv` */
export function stampedFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
