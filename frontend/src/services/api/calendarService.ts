// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/calendarService.ts
// Thin transport layer for /api/calendar/*
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

export type CalendarEventType = 'task' | 'deal';

/**
 * One normalized event, shaped server-side so the grid never has to branch on
 * `type` to find a date. Task-only and deal-only fields are nullable rather
 * than a discriminated union — the pill reads `type` + `title`, the day drawer
 * reads the rest.
 */
export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  /** ISO-8601 UTC. Task.dueDate | Deal.expectedCloseDate */
  date: string;
  /** Task: Open | In Progress | Done — Deal: pipeline stage */
  status: string;
  /** Task only */
  priority: 'High' | 'Medium' | 'Low' | null;
  /** Deal only */
  value: number | null;
  /** Deal only */
  currency: string | null;
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  } | null;
  relatedTo: {
    id: string;
    model: 'Lead' | 'Deal' | 'Contact';
    label: string | null;
  } | null;
}

export interface GetCalendarEventsParams {
  /** 1-12 */
  month: number;
  year: number;
  /** Omit for both. Powers the "show deals" toggle. */
  types?: CalendarEventType[];
}

export interface GetCalendarEventsResponse {
  month: number;
  year: number;
  range: { from: string; to: string };
  counts: { tasks: number; deals: number; total: number };
  events: CalendarEvent[];
}

export const calendarService = {
  getEvents: async ({
    month,
    year,
    types,
  }: GetCalendarEventsParams): Promise<GetCalendarEventsResponse> => {
    const searchParams = new URLSearchParams({
      month: String(month),
      year: String(year),
    });
    if (types?.length) {
      searchParams.set('types', types.join(','));
    }
    const res = await axiosInstance.get(`/calendar/events?${searchParams.toString()}`);
    return res.data.data;
  },
};
