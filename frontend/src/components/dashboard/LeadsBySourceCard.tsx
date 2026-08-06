// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/LeadsBySourceCard.tsx
// Donut + legend. Source colors now come from the shared categorical ramp
// instead of six hardcoded hexes, so the chart retunes with the theme and
// matches every other series in the app.
// ─────────────────────────────────────────────────────────────────────────────
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { useLeadsBySource } from '@/hooks/useDashboard';
import { CATEGORICAL_SERIES, tooltipStyle } from '@/lib/chartTheme';
import { formatNumber } from '@/lib/format';
import CardErrorState from '@/components/dashboard/CardErrorState';
import { DashCard, DashCardHeader, DashCardSkeleton } from '@/components/dashboard/DashCard';

// Stable slot per known source, so a given channel keeps its color between
// refetches even when the ordering of the response changes.
const SOURCE_SLOT: Record<string, number> = {
  'Cold Outreach': 0,
  Event: 1,
  Social: 2,
  Website: 3,
  Referral: 4,
  Other: 6,
};

export default function LeadsBySourceCard() {
  const { data, isLoading, isError, refetch } = useLeadsBySource();

  if (isLoading) {
    return <DashCardSkeleton className="min-h-[250px] w-full" lines={1} showChart />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="min-h-[250px]" />;
  }

  const sourcesArray = Array.isArray(data) ? data : data?.sources || [];

  const chartData = sourcesArray.map((item: any, index: number) => {
    const name = item.source || item.name;
    const slot = SOURCE_SLOT[name] ?? index;
    return {
      name,
      value: item.count || item.value,
      fill: CATEGORICAL_SERIES[slot % CATEGORICAL_SERIES.length],
    };
  });

  const total = chartData.reduce((sum: number, d: any) => sum + (d.value || 0), 0);

  return (
    <DashCard interactive className="h-full min-h-[250px] p-6">
      <DashCardHeader title="Leads by Source" subtitle="Distribution across channels" />

      {chartData.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <PieIcon size={20} className="mb-2 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">No source data yet.</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center gap-4 md:flex-row">
          <div className="relative h-[140px] w-full md:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={64}
                  paddingAngle={2}
                  cornerRadius={3}
                  dataKey="value"
                  stroke="none"
                />
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>

            {/* Total lives in the hole — the donut's whole reason to exist */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
                {formatNumber(total)}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Leads
              </span>
            </div>
          </div>

          <ul className="flex w-full flex-col gap-2 md:w-1/2">
            {chartData.map((item: any) => (
              <li key={item.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="truncate text-foreground">{item.name}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                  {formatNumber(item.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashCard>
  );
}
