// ─────────────────────────────────────────────────────────────────────────────
// dayjs setup — configure with locale, timezone, and plugins
// Import this file once in your app entry point (main.tsx)
// ─────────────────────────────────────────────────────────────────────────────
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);

export { dayjs };

export const formatDate = (date: string | Date | null | undefined, format = 'MMM D, YYYY'): string => {
  if (date === null || date === undefined) {
    return '—';
  }
  return dayjs(date).format(format);
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (date === null || date === undefined) {
    return '—';
  }
  return dayjs(date).format('MMM D, YYYY [at] h:mm A');
};

export const formatRelative = (date: string | Date | null | undefined): string => {
  if (date === null || date === undefined) {
    return '—';
  }
  return dayjs(date).fromNow();
};

export const isExpired = (expiryTimestamp: number): boolean => {
  return Date.now() > expiryTimestamp;
};
