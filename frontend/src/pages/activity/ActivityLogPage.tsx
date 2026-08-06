// ─────────────────────────────────────────────────────────────────────────────
// pages/activity/ActivityLogPage.tsx
// Organisation-wide feed, derived from timestamps the app already writes.
//
// A timeline rather than a DataTable: every row has the same four parts (who,
// did what, to which record, when), and a table would spend four columns
// restating a sentence. Tables are for comparing values down a column; nothing
// here is comparable that way.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import SegmentedControl from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { useActivityLog } from '@/hooks/useActivityLog';
import type { ActivityItem, ActivityType } from '@/services/api/activityService';
import { formatRelative } from '@/lib/dayjs';
import { DURATION, EASE_OUT, pageVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 25;

type Filter = ActivityType | 'all';

const FILTER_SEGMENTS = [
  { value: 'all' as const, label: 'All' },
  { value: 'lead' as const, label: 'Leads' },
  { value: 'deal' as const, label: 'Deals' },
  { value: 'task' as const, label: 'Tasks' },
  { value: 'member' as const, label: 'Team' },
];

// Icon + tone per event type. Tones come from the status ramp, so the feed reads
// as the same system as the badges everywhere else.
const TYPE_STYLE: Record<ActivityType, { icon: typeof Users; wrap: string }> = {
  lead: { icon: Users, wrap: 'bg-status-info/10 text-status-info' },
  deal: { icon: Trophy, wrap: 'bg-status-accent/10 text-status-accent' },
  task: { icon: CheckSquare, wrap: 'bg-status-positive/10 text-status-positive' },
  member: { icon: UserPlus, wrap: 'bg-status-warn/10 text-status-warn' },
};

/** Only leads have a detail route today; everything else links to its list. */
function hrefFor(item: ActivityItem): string | null {
  if (item.entityType === 'Lead' && item.entityId) return `/leads/${item.entityId}`;
  if (item.entityType === 'Task') return '/tasks';
  if (item.entityType === 'Deal') return '/pipeline';
  if (item.entityType === 'User') return '/settings/team';
  return null;
}

function ActivityRow({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const style = TYPE_STYLE[item.type] ?? TYPE_STYLE.lead;
  const Icon = style.icon;
  const href = hrefFor(item);

  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {/* Spine — drawn per-row and skipped on the last one, so it terminates at
          the final marker instead of trailing into empty space. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border/60"
        />
      )}

      <span
        className={cn(
          'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background',
          style.wrap
        )}
      >
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <p className="text-[13px] leading-snug text-foreground">
          {item.actor ? (
            <span className="font-medium">
              {item.actor.firstName} {item.actor.lastName}
            </span>
          ) : (
            <span className="text-muted-foreground">Someone</span>
          )}{' '}
          <span className="text-muted-foreground">{item.action}</span>
          {' — '}
          {href ? (
            <Link
              to={href}
              className="font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-primary hover:underline"
            >
              {item.subject}
              <ArrowUpRight size={11} className="ml-0.5 inline" />
            </Link>
          ) : (
            <span className="font-medium">{item.subject}</span>
          )}
        </p>

        {item.note && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.note}</p>
        )}

        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {formatRelative(item.at)}
        </p>
      </div>

      {item.actor && (
        <AvatarWithInitials
          firstName={item.actor.firstName}
          lastName={item.actor.lastName}
          size="xs"
          className="mt-1 shrink-0"
        />
      )}
    </li>
  );
}

export default function ActivityLogPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch, isFetching } = useActivityLog({
    page,
    limit: PAGE_SIZE,
    type: filter === 'all' ? '' : filter,
  });

  const activities = data?.activities ?? [];
  const totalPages = data?.totalPages ?? 1;

  const changeFilter = (next: Filter) => {
    setFilter(next);
    // Page 3 of "all" is rarely page 3 of "deals" — resetting avoids landing on
    // an empty page and looking like there's no data.
    setPage(1);
  };

  return (
    <>
      <Helmet>
        <title>Activity — ElevateCRM</title>
        <meta name="description" content="Who did what across your organisation." />
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-[1000px] flex-col"
      >
        <PageHeader
          title="Activity"
          count={data?.total}
          description="Status changes, completed tasks, closed deals, and new teammates."
          className="mb-8"
          actions={
            <SegmentedControl
              segments={FILTER_SEGMENTS}
              value={filter}
              onChange={changeFilter}
              layoutId="activity-filter"
              size="md"
              aria-label="Activity type"
            />
          }
        />

        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          {isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Activity size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Couldn’t load activity</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  The feed spans four collections — one of them didn’t answer.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : isLoading ? (
            <ul className="space-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex gap-3.5">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-24 animate-pulse rounded bg-muted/60" />
                  </div>
                </li>
              ))}
            </ul>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Activity size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {filter === 'all' ? 'Nothing has happened yet' : 'No activity of this kind'}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {filter === 'all'
                    ? 'Move a lead, complete a task, or close a deal and it shows up here.'
                    : 'Try a different filter.'}
                </p>
              </div>
            </div>
          ) : (
            <motion.ul
              key={`${filter}-${page}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: isFetching ? 0.6 : 1 }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            >
              {activities.map((item, i) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isLast={i === activities.length - 1}
                />
              ))}
            </motion.ul>
          )}
        </div>

        {/* Pagination — range readout plus two arrows, matching DataTable's
            treatment rather than inventing a page-number grid. */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] tabular-nums text-muted-foreground">
              Page {page} of {totalPages} · {data?.total ?? 0} event
              {(data?.total ?? 0) === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}
