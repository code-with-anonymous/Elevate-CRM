// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/ConversionCard.tsx
// Win rate, with a hairline progress track making the percentage physical.
// ─────────────────────────────────────────────────────────────────────────────
import { useStats } from '@/hooks/useDashboard';
import { formatNumber } from '@/lib/format';
import CardErrorState from '@/components/dashboard/CardErrorState';
import { DashCard, DashCardSkeleton, Metric } from '@/components/dashboard/DashCard';

export default function ConversionCard() {
  const { data, isLoading, isError, refetch } = useStats();

  if (isLoading) {
    return <DashCardSkeleton className="h-32" lines={1} />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-32" />;
  }

  const rate = data?.conversion?.rate ?? 0;
  const clamped = Math.max(0, Math.min(100, Number(rate) || 0));

  return (
    <DashCard interactive className="h-32 justify-between p-5">
      <div>
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium text-muted-foreground">Conversion</h3>
          <span className="text-[11px] text-muted-foreground">Win rate</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <Metric value={rate} />
          <span className="text-base font-medium text-muted-foreground">%</span>
        </div>
      </div>

      <div className="space-y-2">
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Conversion rate"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(data?.conversion?.totalLeads)}
          </span>{' '}
          leads ·{' '}
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(data?.conversion?.openTasks)}
          </span>{' '}
          open tasks
        </p>
      </div>
    </DashCard>
  );
}
