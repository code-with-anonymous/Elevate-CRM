// ─────────────────────────────────────────────────────────────────────────────
// pages/calendar/DayDrawer.tsx
// Right-hand drawer for a single day: every event on it, plus the quick actions
// that stop the calendar from being read-only — complete a task, open the
// related lead, add a task already dated to this cell.
//
// Same chrome as AddLeadDrawer (overlay + drawerVariants + max-w-md panel) so
// the app has one drawer, not two that almost match.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, CalendarDays, CheckSquare, Plus, X } from 'lucide-react';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import StatusBadge, { TONE_DOT, toneForStatus } from '@/components/common/StatusBadge';
import TaskCheckbox from '@/components/common/TaskCheckbox';
import { Button } from '@/components/ui/button';
import { Field, controlClass, selectClass } from '@/components/ui/field';
import { useCompleteTask, useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import type { CalendarEvent } from '@/services/api/calendarService';
import { formatCurrency } from '@/lib/format';
import { drawerVariants, overlayVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

interface DayDrawerProps {
  /** YYYY-MM-DD (UTC) — null closes the drawer. */
  isoDate: string | null;
  events: CalendarEvent[];
  onClose: () => void;
}

const PRIORITIES = ['High', 'Medium', 'Low'] as const;

/** "Thursday, 6 August 2026" from a YYYY-MM-DD. Parsed as UTC to match the grid. */
function formatHeading(iso: string): { weekday: string; date: string } {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    date: d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

// ── One event row ─────────────────────────────────────────────────────────────

interface EventRowProps {
  event: CalendarEvent;
  onToggleComplete: (event: CalendarEvent) => void;
  onOpenRelated: (event: CalendarEvent) => void;
}

function EventRow({ event, onToggleComplete, onOpenRelated }: EventRowProps) {
  const isTask = event.type === 'task';
  const done = isTask && event.status === 'Done';
  // Deals link to their originating lead; tasks link to whatever they're
  // attached to. A task with no relatedTo simply has nothing to open.
  const canOpen = event.relatedTo?.model === 'Lead' && Boolean(event.relatedTo.id);

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors duration-150 hover:border-border">
      {isTask ? (
        <TaskCheckbox checked={done} onToggle={() => onToggleComplete(event)} size="sm" className="mt-0.5" />
      ) : (
        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-status-accent" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-[13px] font-medium leading-snug transition-[opacity,color] duration-200',
              done ? 'text-muted-foreground line-through opacity-60' : 'text-foreground'
            )}
          >
            {event.title}
          </p>
          {event.type === 'deal' && event.value !== null && (
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
              {formatCurrency(event.value)}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={event.status} size="sm" />

          {event.priority && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[toneForStatus(event.priority)])} />
              {event.priority}
            </span>
          )}

          {event.relatedTo?.label && (
            <span className="truncate text-[11px] text-muted-foreground">
              {event.relatedTo.model} · {event.relatedTo.label}
            </span>
          )}

          {event.assignee && (
            <AvatarWithInitials
              firstName={event.assignee.firstName}
              lastName={event.assignee.lastName}
              size="xs"
            />
          )}

          {canOpen && (
            <button
              type="button"
              onClick={() => onOpenRelated(event)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:text-primary"
            >
              Open
              <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export default function DayDrawer({ isoDate, events, onClose }: DayDrawerProps) {
  const navigate = useNavigate();
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium');

  // Escape closes. AddLeadDrawer predates this and only closes on the scrim —
  // worth adding here rather than propagating the gap.
  useEffect(() => {
    if (!isoDate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isoDate, onClose]);

  // Reset the composer whenever the drawer points at a different day, so
  // yesterday's half-typed title doesn't reappear on tomorrow.
  useEffect(() => {
    setComposerOpen(false);
    setTitle('');
    setPriority('Medium');
  }, [isoDate]);

  const heading = useMemo(() => (isoDate ? formatHeading(isoDate) : null), [isoDate]);

  // Tasks first: they're actionable, deals are informational.
  const sorted = useMemo(
    () => [...events].sort((a, b) => (a.type === b.type ? 0 : a.type === 'task' ? -1 : 1)),
    [events]
  );

  const handleToggleComplete = (event: CalendarEvent) => {
    if (event.status === 'Done') {
      updateTask.mutate({ id: event.id, data: { status: 'Open' } });
    } else {
      completeTask.mutate(event.id);
    }
  };

  const handleOpenRelated = (event: CalendarEvent) => {
    if (event.relatedTo?.model === 'Lead') {
      navigate(`/leads/${event.relatedTo.id}`);
      onClose();
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !isoDate) return;
    createTask.mutate(
      {
        title: title.trim(),
        priority,
        status: 'Open',
        // Midday UTC, not midnight. A task stamped at 00:00Z is the very first
        // instant of the day — any consumer that shifts it into a behind-UTC
        // timezone renders it on the previous date. Noon survives ±12h.
        dueDate: `${isoDate}T12:00:00.000Z`,
      },
      {
        onSuccess: () => {
          setTitle('');
          setComposerOpen(false);
        },
      }
    );
  };

  return (
    <AnimatePresence>
      {isoDate && heading && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-[2px]"
          />

          <motion.div
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label={`Events on ${heading.date}`}
            className="fixed bottom-0 right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border/60 bg-card shadow-pop"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-6 py-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  {heading.weekday}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {heading.date} ·{' '}
                  <span className="tabular-nums">
                    {events.length} event{events.length === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {/* Event list */}
            <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
              {sorted.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <CalendarDays size={20} />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">Nothing on this day</p>
                  <p className="text-[11px] text-muted-foreground">
                    Add a task below and it’ll be dated to {heading.date}.
                  </p>
                </div>
              ) : (
                sorted.map((event) => (
                  <EventRow
                    key={`${event.type}-${event.id}`}
                    event={event}
                    onToggleComplete={handleToggleComplete}
                    onOpenRelated={handleOpenRelated}
                  />
                ))
              )}
            </div>

            {/* Composer — the date is fixed by the cell you clicked, so it's
                shown as context rather than offered as an editable field. */}
            <div className="border-t border-border/60 px-6 py-4">
              {composerOpen ? (
                <form onSubmit={handleCreate} className="space-y-3">
                  <Field label="Task" htmlFor="day-task-title" required>
                    <input
                      id="day-task-title"
                      type="text"
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Follow up with…"
                      className={controlClass}
                    />
                  </Field>

                  <Field label="Priority" htmlFor="day-task-priority">
                    <select
                      id="day-task-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
                      className={selectClass}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex items-center gap-2">
                    <Button type="submit" isLoading={createTask.isPending} disabled={!title.trim()}>
                      <CheckSquare size={15} />
                      Add task
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setComposerOpen(false)}>
                      Cancel
                    </Button>
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      Due {heading.date}
                    </span>
                  </div>
                </form>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setComposerOpen(true)}>
                  <Plus size={15} />
                  Add task on {heading.date}
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
