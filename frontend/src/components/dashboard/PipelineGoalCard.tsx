// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/PipelineGoalCard.tsx
// The screen's hero metric. Previously a slate-gradient block that read like a
// banking app; now a monochrome card lit by a radial accent bloom, so the
// figure carries the weight instead of the background.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useStats } from '@/hooks/useDashboard';
import { ROUTES } from '@/constants';
import { formatCurrency } from '@/lib/format';
import CardErrorState from '@/components/dashboard/CardErrorState';
import { DashCard, DashCardSkeleton, MetricLabel } from '@/components/dashboard/DashCard';

export default function PipelineGoalCard() {
  const { data, isLoading, isError, refetch } = useStats();

  if (isLoading) {
    return <DashCardSkeleton className="h-44" lines={1} />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-44" />;
  }

  return (
    <DashCard variant="hero" interactive className="h-44 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            Pipeline Goal
          </h3>
          <p className="text-xs text-muted-foreground">Total open deal value</p>
        </div>

        <Link
          to={ROUTES.LEADS}
          aria-label="View all leads"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight size={15} />
        </Link>
      </div>

      <div className="mt-auto">
        <MetricLabel>Pipeline value</MetricLabel>
        <p className="mt-1 text-[34px] font-semibold leading-none tracking-tighter tabular-nums text-foreground">
          {formatCurrency(data?.pipelineValue)}
        </p>

        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-positive opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-positive" />
          </span>
          Live
        </div>
      </div>
    </DashCard>
  );
}
