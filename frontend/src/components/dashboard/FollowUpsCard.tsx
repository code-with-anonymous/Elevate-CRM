// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/FollowUpsCard.tsx
// Priority drops from a filled badge to a dot + label — it's a secondary
// attribute and shouldn't outweigh the task title.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, FileText, Phone } from 'lucide-react';
import { ROUTES } from '@/constants';
import { useFollowUps } from '@/hooks/useDashboard';
import { formatRelativeDate, isOverdue } from '@/lib/format';
import { cn } from '@/lib/cn';
import { TONE_DOT, toneForStatus } from '@/components/common/StatusBadge';
import CardErrorState from '@/components/dashboard/CardErrorState';
import { DashCard, DashCardHeader, DashCardSkeleton } from '@/components/dashboard/DashCard';

function iconFor(item: any) {
  if (item.type === 'call') return Phone;
  if (item.type === 'task' && item.title?.toLowerCase().includes('meeting')) {
    return CalendarCheck;
  }
  return FileText;
}

export default function FollowUpsCard() {
  const { data, isLoading, isError, refetch } = useFollowUps();
  const followUps = Array.isArray(data) ? data : data?.followUps || [];

  if (isLoading) {
    return <DashCardSkeleton className="h-64" lines={3} />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-64" />;
  }

  return (
    <DashCard className="h-64 p-5">
      <DashCardHeader title="Upcoming Follow-ups" subtitle="Don't let these slip" />

      <div className="mt-4 flex flex-1 flex-col justify-between overflow-hidden">
        {followUps.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <CalendarCheck size={20} className="mb-2 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">Nothing due. You're clear.</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {followUps.slice(0, 3).map((item: any) => {
              const Icon = iconFor(item);
              const due = item.dueDateRaw || item.date;
              const overdue = isOverdue(due);
              const tone = toneForStatus(item.priority);

              return (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon size={13} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          overdue && 'font-medium text-status-negative'
                        )}
                      >
                        {formatRelativeDate(due)}
                      </span>
                      {' · '}
                      {item.assignee?.name || item.assignedTo || 'Unassigned'}
                    </p>
                  </div>

                  {item.priority && (
                    <span className="mt-1 flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
                      {item.priority}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Link
          to={`${ROUTES.TASKS}?filter=upcoming`}
          className="group mt-4 inline-flex items-center gap-1 self-end text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          View all
          <ArrowRight
            size={12}
            className="transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </DashCard>
  );
}
