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
    // `h-full` removed. Combined with the page's `flex-1` wrapper it made this
    // card absorb every spare pixel in the right-hand column — and because the
    // column stretches to the tallest column in the grid row, the empty state
    // became a ~600px card with one small icon adrift in the middle.
    //
    // A natural height with a sensible floor is honest in both states: ~250px
    // empty, ~250-290px with a donut and legend.
    <DashCard interactive className="min-h-[250px] p-6">
      <DashCardHeader title="Leads by Source" subtitle="Distribution across channels" />

      {chartData.length === 0 ? (
        // Fixed height rather than flex-1, so this can't inflate again if a
        // future layout hands the card extra room.
        <div className="flex h-[150px] flex-col items-center justify-center text-center">
          <PieIcon size={20} className="mb-2 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">No source data yet.</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            Add leads with a source to see the split.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-4 md:flex-row">
          <div className="relative h-[140px] w-full md:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  // Percentages, not pixels. innerRadius={46}/outerRadius={64}
                  // asked for a fixed 128px-wide donut, but this card lives in
                  // `xl:col-span-3` — so the WIDER the viewport, the NARROWER the
                  // card, and `md:w-1/2` then hands the chart about half of that.
                  // Below a ~340px card the donut was drawn larger than its own
                  // SVG and came out with its left and right sliced flat.
                  //
                  // Recharts resolves a percentage against getMaxRadius() =
                  // min(plotWidth, plotHeight) / 2, so these track the smaller
                  // dimension and can never exceed the box. 94/68 was picked to
                  // preserve the current look where it already fitted: at full
                  // width that is a 122px donut with a 17px ring, against 128/18
                  // before — while a 250px card now yields a clean 70px donut
                  // instead of a clipped one.
                  innerRadius="68%"
                  outerRadius="94%"
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
                  {/* `title` because this label truncates: in a narrow card
                      "Cold Outreach" renders as "Cold Outre…" and there was no
                      way to read the rest. Truncating stays the right call —
                      wrapping would make the rows uneven and push the last
                      source out of the card. */}
                  <span className="truncate text-foreground" title={item.name}>
                    {item.name}
                  </span>
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
