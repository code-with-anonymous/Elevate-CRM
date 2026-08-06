import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { ArrowUpRight } from 'lucide-react';
import { useLeadActivity } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';

import CardErrorState from '@/components/dashboard/CardErrorState';

export default function LeadActivityTable() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useLeadActivity();
  const activities = Array.isArray(data) ? data : (data?.activities || []);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm min-h-[300px] flex-1">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Lead Activity</h3>
          <p className="text-xs text-muted-foreground">Recent lead movements</p>
        </div>
        <Link to={ROUTES.LEADS} className="text-muted-foreground transition-colors hover:text-foreground">
          <ArrowUpRight size={16} />
        </Link>
      </div>

      <div className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : isError ? (
          <CardErrorState onRetry={() => refetch()} heightClass="min-h-[200px]" />
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="pb-3 font-medium">NAME</th>
                <th className="pb-3 font-medium">DATE</th>
                <th className="pb-3 font-medium">TIME</th>
                <th className="pb-3 font-medium">STATUS</th>
                <th className="pb-3 font-medium text-right">VALUE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activities.map((row: any) => {
                let dotClass = 'bg-blue-500';
                if (row.status === 'Won') dotClass = 'bg-green-500';
                if (row.status === 'Qualified') dotClass = 'bg-purple-500';
                if (row.status === 'Contacted') dotClass = 'bg-amber-500';
                if (row.status === 'Proposal') dotClass = 'bg-indigo-500';
                if (row.status === 'Lost') dotClass = 'bg-red-500';

                return (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`${ROUTES.LEADS}/${row.id}`)}
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: row.avatarColor || '#3B82F6' }}
                        >
                          {row.initials}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{row.fullName || row.name}</p>
                          <p className="text-[10px] text-muted-foreground">{row.company}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground">{row.date}</td>
                    <td className="py-3 text-muted-foreground">{row.time}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                        <span className="text-xs font-medium text-foreground">{row.status}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-medium text-foreground">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && !isError && (
        <div className="mt-4 flex justify-end">
          <Link to={ROUTES.LEADS} className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
            View all leads
          </Link>
        </div>
      )}
    </div>
  );
}
