// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/RevenueGoalCard.tsx
// Closed-won total over an area trend. The chart is chrome behind the figure,
// not the subject — so it sits at low opacity and runs to the card edges.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CheckSquare, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRevenueTrend, useStats } from '@/hooks/useDashboard';
import { ROUTES } from '@/constants';
import { formatCurrency } from '@/lib/format';
import { chartColor } from '@/lib/chartTheme';
import AddLeadDrawer from '@/components/leads/AddLeadDrawer';
import CardErrorState from '@/components/dashboard/CardErrorState';
import {
  DashCard,
  DashCardSkeleton,
  MetricLabel,
} from '@/components/dashboard/DashCard';

export default function RevenueGoalCard() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useStats();
  const {
    data: revenueData,
    isLoading: chartLoading,
    refetch: refetchRevenue,
  } = useRevenueTrend();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isLoading = statsLoading || chartLoading;

  const trendArray = Array.isArray(revenueData) ? revenueData : revenueData?.trend || [];

  const chartData = trendArray.map((d: any) => ({
    name: d.label || d.name,
    value: d.value,
  }));
  const totalWon = revenueData?.totalWon ?? stats?.weeklyRevenue?.amount ?? 0;

  // The trend is background chrome painted ACROSS the figure, which only works
  // when the line actually moves. A flat series renders as a horizontal rule at
  // the vertical centre of the band — straight through "$0" — so it reads as a
  // strikethrough rather than a chart.
  //
  // With every value 0 the domain is ['dataMin - 10000', 'dataMax + 10000'] =
  // [-10000, 10000], which puts zero exactly at mid-height. Same problem for any
  // all-identical series. So: only draw it when there's real movement to show.
  const trendValues = chartData.map((d: { value: number }) => Number(d.value) || 0);
  const hasTrend =
    trendValues.length >= 2 &&
    trendValues.some((v: number) => v > 0) &&
    new Set(trendValues).size > 1;

  if (isLoading) {
    return <DashCardSkeleton className="h-48" lines={1} showChart />;
  }

  if (statsError) {
    return (
      <CardErrorState
        onRetry={() => {
          refetchStats();
          refetchRevenue();
        }}
        heightClass="h-48"
      />
    );
  }

  return (
    <DashCard interactive className="h-48 justify-between p-6">
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            Revenue Goal
          </h3>
          <p className="text-xs text-muted-foreground">Closed-won total</p>
        </div>
        <Link
          to={ROUTES.LEADS}
          aria-label="View leads"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight size={15} />
        </Link>
      </div>

      <div className="relative z-10 mt-2">
        <MetricLabel>Total won</MetricLabel>
        <p className="mt-0.5 text-[28px] font-semibold leading-none tracking-tighter tabular-nums text-foreground">
          {formatCurrency(totalWon)}
        </p>
      </div>

      {/* Trend runs edge-to-edge behind the figure and the buttons.
          Omitted entirely when flat — see `hasTrend`. */}
      {hasTrend && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[52px] top-16 opacity-70">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGoalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor.primary} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chartColor.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Anchored at 0 rather than `dataMin - 10000`: a floor below zero
                  pushes a low series up into the text, which is the same
                  collision in a milder form. */}
              <YAxis domain={[0, 'dataMax + 10000']} hide />
              <XAxis dataKey="name" hide />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor.primary}
                strokeWidth={1.75}
                fillOpacity={1}
                fill="url(#revenueGoalFill)"
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="relative z-10 mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card/80 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors duration-150 hover:border-border hover:bg-muted"
        >
          <Plus size={13} /> Add Lead
        </button>
        <Link
          to={ROUTES.TASKS}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card/80 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors duration-150 hover:border-border hover:bg-muted"
        >
          <CheckSquare size={13} /> Task
        </Link>
      </div>

      <AddLeadDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </DashCard>
  );
}
