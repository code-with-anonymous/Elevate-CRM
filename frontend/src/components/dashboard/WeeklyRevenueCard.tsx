import { useStats } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

import CardErrorState from '@/components/dashboard/CardErrorState';

export default function WeeklyRevenueCard() {
  const { data, isLoading, isError, refetch } = useStats();

  if (isLoading) {
    return <Skeleton className="h-32 rounded-xl border border-border" />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-32" />;
  }

  const amount = data?.weeklyRevenue?.amount || 0;
  const delta = data?.weeklyRevenue?.delta || 0;
  const isPositive = delta >= 0;

  // Generate some stable fake sparkline data using the main value as end
  const sparkData = [
    { value: amount * 0.5 },
    { value: amount * 0.7 },
    { value: amount * 0.6 },
    { value: amount * 0.9 },
    { value: amount },
  ];

  return (
    <div className="relative flex h-32 flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Weekly Revenue</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(amount)}
            </span>
            <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${isPositive ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
              {isPositive ? '▲' : '▼'} {Math.abs(delta)}%
            </span>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-12 overflow-hidden rounded-b-xl opacity-60 pointer-events-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <YAxis domain={['dataMin - 100000', 'dataMax + 100000']} hide />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(var(--color-primary))" 
              strokeWidth={2} 
              dot={false}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
