import { useState } from 'react';
import { useStats, useRevenueTrend } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis } from 'recharts';
import { ArrowUpRight, Plus, CheckSquare } from 'lucide-react';
import AddLeadDrawer from '@/components/leads/AddLeadDrawer';

import CardErrorState from '@/components/dashboard/CardErrorState';

export default function RevenueGoalCard() {
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useStats();
  const { data: revenueData, isLoading: chartLoading, refetch: refetchRevenue } = useRevenueTrend();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isLoading = statsLoading || chartLoading;

  const trendArray = Array.isArray(revenueData)
    ? revenueData
    : (revenueData?.trend || []);

  const chartData = trendArray.map((d: any) => ({ 
    name: d.label || d.name, 
    value: d.value 
  }));
  const totalWon = revenueData?.totalWon ?? stats?.weeklyRevenue?.amount ?? 0;

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl border border-border" />;
  }

  if (statsError) {
    return <CardErrorState onRetry={() => { refetchStats(); refetchRevenue(); }} heightClass="h-48" />;
  }

  return (
    <div className="flex h-48 flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Revenue Goal</h3>
          <p className="text-xs text-muted-foreground">Closed-won total</p>
        </div>
        <button className="text-muted-foreground transition-colors hover:text-foreground">
          <ArrowUpRight size={16} />
        </button>
      </div>

      <div className="relative mt-2 flex-1">
        <div className="absolute top-0 z-10 pointer-events-none">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Won</p>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalWon)}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 top-0 opacity-60 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--color-primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--color-primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={['dataMin - 10000', 'dataMax + 10000']} hide />
              <XAxis dataKey="name" hide />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--color-primary))" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button 
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Plus size={14} /> Add Lead
        </button>
        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
          <CheckSquare size={14} /> Task
        </button>
      </div>

      <AddLeadDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
