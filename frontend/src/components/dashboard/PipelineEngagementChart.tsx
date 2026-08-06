// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/PipelineEngagementChart.tsx
// Period switch is now a segmented control. Chart colors come from
// lib/chartTheme so the bars actually paint — the old `hsl(var(--color-primary))`
// expanded to `hsl(hsl(…))` and resolved to nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { usePipelineChart } from '@/hooks/useDashboard';
import { axisTick, chartColor, tooltipStyle } from '@/lib/chartTheme';
import { DURATION, EASE_OUT } from '@/lib/motion';
import SegmentedControl from '@/components/ui/segmented-control';
import CardErrorState from '@/components/dashboard/CardErrorState';
import { DashCard, DashCardHeader } from '@/components/dashboard/DashCard';

type Period = 'monthly' | 'annually';

const PERIODS = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'annually' as const, label: 'Annually' },
];

export default function PipelineEngagementChart() {
  const [period, setPeriod] = useState<Period>('monthly');
  const { data: chartResponse, isLoading, isError, refetch } = usePipelineChart(period);

  const dataArray = Array.isArray(chartResponse) ? chartResponse : chartResponse?.data || [];

  const peakMonth = chartResponse?.peakMonth;
  const peakGrowth = chartResponse?.peakGrowth;

  // Per-bar color rides on the datum — Recharts 3 deprecated <Cell>. Only the
  // peak month gets the full accent; the rest sit back at 28%.
  const chartData = dataArray.map((d: any) => {
    const name = d.label || d.name;
    return {
      name,
      value: d.value,
      fill: name === peakMonth ? chartColor.primary : chartColor.primaryMuted,
    };
  });

  return (
    <DashCard className="h-[300px] p-6">
      <DashCardHeader
        title="Pipeline Engagement"
        subtitle={`New leads per ${period === 'monthly' ? 'month' : 'year'}`}
        action={
          <SegmentedControl
            segments={PERIODS}
            value={period}
            onChange={setPeriod}
            layoutId="pipeline-period"
            aria-label="Chart period"
          />
        }
      />

      <div className="relative mt-5 min-h-0 w-full flex-1">
        {isLoading ? (
          <ChartSkeleton />
        ) : isError ? (
          <CardErrorState onRetry={() => refetch()} heightClass="h-full" />
        ) : (
          <>
            <AnimatePresence>
              {peakMonth && peakGrowth !== null && peakGrowth !== undefined && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.normal, ease: EASE_OUT }}
                  className="absolute -top-1 right-0 z-10 inline-flex items-center gap-1 rounded-full bg-status-positive/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-status-positive ring-1 ring-inset ring-status-positive/20"
                >
                  <TrendingUp size={10} />
                  Peak {peakMonth} +{peakGrowth}%
                </motion.div>
              )}
            </AnimatePresence>

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="2 4"
                  vertical={false}
                  stroke={chartColor.grid}
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                  dy={8}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)', radius: 6 }}
                  {...tooltipStyle}
                />
                <Bar
                  dataKey="value"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={38}
                  isAnimationActive
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </DashCard>
  );
}

/** Bar-shaped skeleton so loading reads as a chart, not a grey slab. */
function ChartSkeleton() {
  const heights = [45, 70, 55, 85, 60, 95, 50, 75, 65, 90, 58, 80];
  return (
    <div className="flex h-full items-end gap-2 pb-6">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t-md bg-muted"
          style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}
