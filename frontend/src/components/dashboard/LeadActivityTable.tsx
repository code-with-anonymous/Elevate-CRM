// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/LeadActivityTable.tsx
// Rows reveal their actions on hover instead of carrying permanent chrome.
//
// Delete uses the existing `useDeleteLead` mutation, which already invalidates
// the `['dashboard']` key — so the row leaves this table on success without any
// new query wiring.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Activity, Trash2 } from 'lucide-react';
import { ROUTES } from '@/constants';
import { useLeadActivity } from '@/hooks/useDashboard';
import { useDeleteLead } from '@/hooks/useLeads';
import { getAvatarColor } from '@/components/common/AvatarWithInitials';
import { TONE_DOT, toneForStatus } from '@/components/common/StatusBadge';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { staggerContainer, staggerItem } from '@/lib/motion';
import CardErrorState from '@/components/dashboard/CardErrorState';
import { DashCard, DashCardHeader } from '@/components/dashboard/DashCard';

export default function LeadActivityTable() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useLeadActivity();
  const deleteLead = useDeleteLead();

  const activities = Array.isArray(data) ? data : data?.activities || [];

  const handleDelete = (row: any) => {
    if (!confirm(`Delete lead "${row.fullName || row.name}"? This cannot be undone.`)) {
      return;
    }
    deleteLead.mutate(row.id);
  };

  return (
    <DashCard className="min-h-[300px] flex-1 p-6">
      <DashCardHeader
        title="Lead Activity"
        subtitle="Recent lead movements"
        action={
          <Link
            to={ROUTES.LEADS}
            aria-label="View all leads"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight size={15} />
          </Link>
        }
      />

      <div className="mt-4 flex-1 overflow-x-auto">
        {isLoading ? (
          <ActivitySkeleton />
        ) : isError ? (
          <CardErrorState onRetry={() => refetch()} heightClass="min-h-[200px]" />
        ) : activities.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
              <Activity size={19} />
            </div>
            <p className="text-[13px] font-medium text-foreground">No recent activity</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lead movements will appear here as your team works the pipeline.
            </p>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {['Name', 'Date', 'Time', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-border/60 pb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
                <th className="whitespace-nowrap border-b border-border/60 pb-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Value
                </th>
                <th className="w-px border-b border-border/60" />
              </tr>
            </thead>

            <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
              {activities.map((row: any) => {
                const tone = toneForStatus(row.status);
                return (
                  <motion.tr
                    key={row.id}
                    variants={staggerItem}
                    onClick={() => navigate(`${ROUTES.LEADS}/${row.id}`)}
                    className="group cursor-pointer transition-colors duration-150 hover:bg-muted/40"
                  >
                    <td className="border-b border-border/40 py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                          style={{
                            backgroundColor:
                              row.avatarColor || getAvatarColor(row.fullName || row.name || ''),
                          }}
                        >
                          {row.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {row.fullName || row.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {row.company}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-border/40 py-2.5 pr-3 text-xs tabular-nums text-muted-foreground">
                      {row.date}
                    </td>
                    <td className="whitespace-nowrap border-b border-border/40 py-2.5 pr-3 text-xs tabular-nums text-muted-foreground">
                      {row.time}
                    </td>
                    <td className="border-b border-border/40 py-2.5 pr-3">
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
                        <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
                        {row.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-b border-border/40 py-2.5 text-right text-[13px] font-medium tabular-nums text-foreground">
                      {formatCurrency(row.value)}
                    </td>

                    {/* Hover-revealed action rail */}
                    <td
                      className="w-px border-b border-border/40 py-2.5 pl-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="row-actions flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="Open lead"
                          aria-label="Open lead"
                          onClick={() => navigate(`${ROUTES.LEADS}/${row.id}`)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                        >
                          <ArrowUpRight size={14} />
                        </button>
                        <button
                          type="button"
                          title="Delete lead"
                          aria-label="Delete lead"
                          disabled={deleteLead.isPending}
                          onClick={() => handleDelete(row)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </table>
        )}
      </div>

      {!isLoading && !isError && activities.length > 0 && (
        <Link
          to={ROUTES.LEADS}
          className="group mt-4 inline-flex items-center gap-1 self-end text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          View all leads
          <ArrowRight
            size={12}
            className="transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Link>
      )}
    </DashCard>
  );
}

/** Mirrors the real row: avatar circle, two text lines, right-aligned figure. */
function ActivitySkeleton() {
  return (
    <div className="space-y-3.5 pt-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
