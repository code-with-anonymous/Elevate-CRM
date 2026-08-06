// ─────────────────────────────────────────────────────────────────────────────
// pages/calendar/CalendarPage.tsx
// Month view over Tasks (due dates) + Deals (expected close dates).
// Same data as Tasks/Pipeline, new lens — so it reuses the same tokens, the
// same motion vocabulary, and the same empty-state language.
//
// EVERYTHING HERE IS UTC. The API emits UTC, the grid is built from UTC day
// numbers, and useEventsByDay buckets on getUTCDate(). Mix in a local-time
// getDate() anywhere and events near midnight land one cell off.
//
// Step 4 attaches the day drawer + "Add task on this date" to `selectedDay`.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import DayDrawer from '@/pages/calendar/DayDrawer';
import SegmentedControl from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { useCalendarEvents, useEventsByDay } from '@/hooks/useCalendar';
import type { CalendarEvent, CalendarEventType } from '@/services/api/calendarService';
import { formatCompactCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT, pageVariants } from '@/lib/motion';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Monday-first, matching dashboard.service.js's ISO week. Two week conventions
// in one product is the kind of inconsistency nobody can name but everyone feels.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** How many pills fit in a cell before collapsing into "+N more". */
const MAX_PILLS = 3;

const TYPE_SEGMENTS = [
  { value: 'all' as const, label: 'All' },
  { value: 'task' as const, label: 'Tasks' },
  { value: 'deal' as const, label: 'Deals' },
];

type TypeFilter = 'all' | 'task' | 'deal';

// ── Grid construction ─────────────────────────────────────────────────────────

interface GridCell {
  /** 1-31 */
  day: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
  /** YYYY-MM-DD, UTC. Stable key + what the day drawer receives. */
  iso: string;
}

/** UTC day-of-week with Monday as 0, so it indexes WEEKDAYS directly. */
function mondayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

function isoDay(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/**
 * Build the 7-column grid for a month, padded with adjacent-month days so the
 * first row starts on a Monday and the last row ends on a Sunday.
 *
 * Row count is derived rather than fixed at 6: a 6-row grid leaves February an
 * empty trailing row. The cost is that the grid's height changes between
 * months — acceptable, since each cell keeps a fixed min-height so the shift is
 * one row, not a reflow.
 */
function buildMonthGrid(year: number, month: number): GridCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysInPrev = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const lead = mondayIndex(first);

  const cells: GridCell[] = [];

  for (let i = lead; i > 0; i--) {
    const day = daysInPrev - i + 1;
    cells.push({ day, inMonth: false, iso: isoDay(year, month - 1, day) });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, iso: isoDay(year, month, day) });
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - lead - daysInMonth + 1;
    cells.push({ day, inMonth: false, iso: isoDay(year, month + 1, day) });
  }

  return cells;
}

// ── Event pill ────────────────────────────────────────────────────────────────
// Type carries the color — task reads as info, deal as accent — because "what
// kind of thing is this" is the question a calendar answers first. Priority is
// deliberately NOT the color axis: a month of High-priority tasks would render
// as a wall of red and stop meaning anything.

function pillTone(event: CalendarEvent): string {
  if (event.type === 'deal') {
    return 'bg-status-accent/10 text-status-accent ring-status-accent/20';
  }
  if (event.status === 'Done') {
    return 'bg-muted/70 text-muted-foreground ring-border/60 line-through';
  }
  return 'bg-status-info/10 text-status-info ring-status-info/20';
}

function EventPill({ event }: { event: CalendarEvent }) {
  const suffix =
    event.type === 'deal' && event.value !== null ? formatCompactCurrency(event.value) : null;

  return (
    <div
      title={`${event.title}${suffix ? ` · ${suffix}` : ''}`}
      className={cn(
        'flex items-center gap-1 truncate rounded-[5px] px-1.5 py-[3px]',
        'text-[11px] font-medium leading-tight ring-1 ring-inset',
        'transition-colors duration-150',
        pillTone(event)
      )}
    >
      <span className="truncate">{event.title}</span>
      {suffix && <span className="ml-auto shrink-0 tabular-nums opacity-70">{suffix}</span>}
    </div>
  );
}

// ── Day cell ──────────────────────────────────────────────────────────────────

interface DayCellProps {
  cell: GridCell;
  events: CalendarEvent[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: (iso: string) => void;
}

function DayCell({ cell, events, isToday, isSelected, onSelect }: DayCellProps) {
  const visible = events.slice(0, MAX_PILLS);
  const overflow = events.length - visible.length;

  // Adjacent-month days render dimmed and inert: the query is scoped to one
  // month, so they have no events to show and clicking one would open an empty
  // drawer. Showing them keeps the grid rectangular without lying about data.
  if (!cell.inMonth) {
    return (
      <div className="min-h-[104px] bg-muted/20 p-2">
        <span className="text-xs tabular-nums text-muted-foreground/40">{cell.day}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(cell.iso)}
      aria-label={`${cell.day} — ${events.length} event${events.length === 1 ? '' : 's'}`}
      aria-current={isToday ? 'date' : undefined}
      className={cn(
        'group relative flex min-h-[104px] flex-col gap-1 p-2 text-left',
        'transition-colors duration-150 ease-out',
        'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
        // Today gets a wash, not a filled block — the accent marks the day
        // without competing with the pills sitting inside it.
        isToday ? 'bg-primary/[0.05] hover:bg-primary/[0.08]' : 'hover:bg-muted/40',
        isSelected && 'z-10 ring-2 ring-inset ring-primary/50'
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
          isToday
            ? 'bg-primary font-semibold text-primary-foreground'
            : 'font-medium text-muted-foreground'
        )}
      >
        {cell.day}
      </span>

      <div className="flex flex-col gap-1">
        {visible.map((event) => (
          <EventPill key={`${event.type}-${event.id}`} event={event} />
        ))}
        {overflow > 0 && (
          <span className="px-1.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
            +{overflow} more
          </span>
        )}
      </div>
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function GridSkeleton({ cellCount }: { cellCount: number }) {
  return (
    <div className="grid grid-cols-7 gap-px bg-border/60">
      {Array.from({ length: cellCount }).map((_, i) => (
        <div key={i} className="min-h-[104px] space-y-1.5 bg-card p-2">
          <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
          {i % 3 === 0 && <div className="h-[18px] w-full animate-pulse rounded-[5px] bg-muted/70" />}
          {i % 4 === 0 && <div className="h-[18px] w-2/3 animate-pulse rounded-[5px] bg-muted/50" />}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);

  const [cursor, setCursor] = useState(() => ({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1, // 1-12
  }));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const types: CalendarEventType[] | undefined =
    typeFilter === 'all' ? undefined : [typeFilter];

  const { data, isLoading, isError, refetch } = useCalendarEvents(
    cursor.month,
    cursor.year,
    types
  );

  const eventsByDay = useEventsByDay(data?.events);
  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  const isCurrentMonth =
    cursor.year === today.getUTCFullYear() && cursor.month === today.getUTCMonth() + 1;
  const todayDate = today.getUTCDate();

  // ── Month navigation ────────────────────────────────────────────────────────
  const step = (delta: number) => {
    setSelectedDay(null);
    setCursor((prev) => {
      const next = prev.month + delta;
      if (next < 1) return { year: prev.year - 1, month: 12 };
      if (next > 12) return { year: prev.year + 1, month: 1 };
      return { year: prev.year, month: next };
    });
  };

  const goToday = () => {
    setSelectedDay(null);
    setCursor({ year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 });
  };

  return (
    <>
      <Helmet>
        <title>Calendar — ElevateCRM</title>
        <meta name="description" content="Task due dates and deal close dates on one calendar." />
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-[1600px] flex-col"
      >
        <PageHeader
          title="Calendar"
          count={data?.counts.total}
          description="Task due dates and expected deal closes, month by month."
          className="mb-8"
          actions={
            <SegmentedControl
              segments={TYPE_SEGMENTS}
              value={typeFilter}
              onChange={setTypeFilter}
              layoutId="calendar-types"
              size="md"
              aria-label="Event type"
            />
          }
        />

        {/* ── Month navigation ─────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {MONTH_LABELS[cursor.month - 1]}{' '}
              <span className="tabular-nums text-muted-foreground">{cursor.year}</span>
            </h2>
            {/* Reserved space rather than a conditional node, so the heading
                doesn't shift left when a background refetch settles. */}
            <span
              className={cn(
                'text-[11px] font-medium text-muted-foreground transition-opacity duration-150',
                isLoading ? 'opacity-100' : 'opacity-0'
              )}
            >
              Loading…
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={goToday} disabled={isCurrentMonth}>
              Today
            </Button>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Grid ─────────────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
            {WEEKDAYS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label[0]}</span>
              </div>
            ))}
          </div>

          {isError ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <CalendarDays size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Couldn’t load this month</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  The request didn’t come back. Check your connection and try again.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : isLoading && !data ? (
            <GridSkeleton cellCount={cells.length} />
          ) : (
            // No per-cell stagger. staggerItem at 30ms × 35 cells is a full
            // second of the grid assembling itself — charming once, tedious on
            // every arrow click. The grid fades as one object instead.
            <motion.div
              key={`${cursor.year}-${cursor.month}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
              className="grid grid-cols-7 gap-px bg-border/60"
            >
              {cells.map((cell) => (
                <div key={cell.iso} className="bg-card">
                  <DayCell
                    cell={cell}
                    events={cell.inMonth ? eventsByDay.get(cell.day) ?? [] : []}
                    isToday={isCurrentMonth && cell.inMonth && cell.day === todayDate}
                    isSelected={selectedDay === cell.iso}
                    onSelect={setSelectedDay}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </div>

        {/* ── Empty month ──────────────────────────────────────────────────── */}
        {/* Sits below the grid rather than replacing it: an empty calendar is
            still a calendar, and swapping it for an empty state would hide the
            dates the user came to look at. */}
        {!isLoading && !isError && data?.counts.total === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal, ease: EASE_OUT }}
            className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 px-6 py-10 text-center"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarDays size={22} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Nothing scheduled in {MONTH_LABELS[cursor.month - 1]}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {typeFilter === 'deal'
                  ? 'No deals are expected to close this month.'
                  : 'Tasks with a due date and deals with a close date show up here.'}
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Day detail. Reads from the same eventsByDay bucket the grid renders,
          so completing a task updates the cell and the drawer from one
          invalidation — no second fetch, no divergence between the two. */}
      <DayDrawer
        isoDate={selectedDay}
        events={selectedDay ? eventsByDay.get(Number(selectedDay.slice(8, 10))) ?? [] : []}
        onClose={() => setSelectedDay(null)}
      />
    </>
  );
}
