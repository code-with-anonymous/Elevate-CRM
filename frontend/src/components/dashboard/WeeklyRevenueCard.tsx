// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/WeeklyRevenueCard.tsx
// Metric + delta pill + sparkline bleeding off the bottom edge.
// ─────────────────────────────────────────────────────────────────────────────
import { useStats } from '@/hooks/useDashboard';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { formatCompactCurrency } from '@/lib/format';
import { chartColor } from '@/lib/chartTheme';
import CardErrorState from '@/components/dashboard/CardErrorState';
import {
  DashCard,
  DashCardSkeleton,
  DeltaPill,
  Metric,
} from '@/components/dashboard/DashCard';

export default function WeeklyRevenueCard() {
  const { data, isLoading, isError, refetch } = useStats();

  if (isLoading) {
    return <DashCardSkeleton className="h-32" lines={1} />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-32" />;
  }

  const amount = data?.weeklyRevenue?.amount || 0;
  const delta = data?.weeklyRevenue?.delta || 0;

  // Shape-only sparkline derived from the headline figure (unchanged).
  const sparkData = [
    { value: amount * 0.5 },
    { value: amount * 0.7 },
    { value: amount * 0.6 },
    { value: amount * 0.9 },
    { value: amount },
  ];

  return (
    <DashCard interactive className="h-32 justify-between p-5">
      <div className="relative z-10">
        <h3 className="text-[13px] font-medium text-muted-foreground">Weekly Revenue</h3>
        <div className="mt-1.5 flex items-center gap-2">
          <Metric value={formatCompactCurrency(amount)} />
          <DeltaPill value={delta} />
        </div>
      </div>

      {/* Sparkline sits behind the numbers and runs to the card edges */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 opacity-70">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <YAxis domain={['dataMin - 100000', 'dataMax + 100000']} hide />
            <Line
              type="monotone"
              dataKey="value"
              stroke={chartColor.primary}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashCard>
  );
}
