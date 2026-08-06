// ─────────────────────────────────────────────────────────────────────────────
// hooks/useCalendar.ts
// TanStack Query hooks for the calendar month view
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  calendarService,
  type CalendarEvent,
  type CalendarEventType,
} from '@services/api/calendarService';

// ── Query keys ────────────────────────────────────────────────────────────────
// year + month as separate members so paging Sep → Oct → Sep serves September
// straight from cache. Task/Deal mutations invalidate the `all` prefix, which
// clears every cached month at once.

export const CALENDAR_QK = {
  all: ['calendar'] as const,
  month: (year: number, month: number, types?: CalendarEventType[]) =>
    [...CALENDAR_QK.all, year, month, types?.join(',') ?? 'all'] as const,
};

// ── Month events ──────────────────────────────────────────────────────────────

/**
 * @param month 1-12 (NOT the 0-indexed value from Date#getMonth)
 */
export function useCalendarEvents(
  month: number,
  year: number,
  types?: CalendarEventType[]
) {
  return useQuery({
    queryKey: CALENDAR_QK.month(year, month, types),
    queryFn: () => calendarService.getEvents({ month, year, types }),
    staleTime: 1000 * 60,
    // Keeps the previous month on screen while the next one loads, so paging
    // doesn't flash an empty grid.
    placeholderData: (prev) => prev,
  });
}

/**
 * Bucket a month's events by UTC day-of-month for O(1) lookup per grid cell.
 * Returns a Map keyed 1-31; days with no events are simply absent.
 *
 * UTC on purpose — the API emits UTC and the grid is built from UTC day
 * numbers, so bucketing must agree or events land one cell off near midnight.
 */
export function useEventsByDay(events: CalendarEvent[] | undefined) {
  return useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const event of events ?? []) {
      const day = new Date(event.date).getUTCDate();
      const bucket = map.get(day);
      if (bucket) bucket.push(event);
      else map.set(day, [event]);
    }
    return map;
  }, [events]);
}
