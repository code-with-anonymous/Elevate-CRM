import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { useFollowUps } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Phone, FileText } from 'lucide-react';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isTomorrow from 'dayjs/plugin/isTomorrow';

dayjs.extend(isToday);
dayjs.extend(isTomorrow);

function formatDueDate(raw: string | null) {
  if (!raw) return '—';
  const d = dayjs(raw);
  if (d.isToday()) return 'Today';
  if (d.isTomorrow()) return 'Tomorrow';
  return d.format('DD MMM');
}

import CardErrorState from '@/components/dashboard/CardErrorState';

export default function FollowUpsCard() {
  const { data, isLoading, isError, refetch } = useFollowUps();
  const followUps = Array.isArray(data) ? data : (data?.followUps || []);

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl border border-border" />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-64" />;
  }

  return (
    <div className="flex h-64 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Upcoming Follow-ups</h3>
        <p className="text-xs text-muted-foreground">Don't let these slip</p>
      </div>
      
      <div className="flex flex-1 flex-col justify-between overflow-hidden">
        <div className="space-y-3">
          {followUps.slice(0, 3).map((item: any) => {
            // Pick an icon based on derived type
            let Icon = FileText;
            if (item.type === 'call') Icon = Phone;
            if (item.type === 'document') Icon = FileText;
            if (item.type === 'task' && item.title?.toLowerCase().includes('meeting')) Icon = Calendar;

            // Priority badge colors
            let priorityClass = 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400';
            if (item.priority === 'High') priorityClass = 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
            if (item.priority === 'Medium') priorityClass = 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';

            return (
              <div key={item.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatDueDate(item.dueDateRaw || item.date)} — {item.assignee?.name || item.assignedTo || 'Unassigned'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass}`}>
                  {item.priority}
                </span>
              </div>
            );
          })}
        </div>
        
        <div className="mt-4 flex justify-end">
          <Link to={`${ROUTES.TASKS}?filter=upcoming`} className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
            View all
          </Link>
        </div>
      </div>
    </div>
  );
}
