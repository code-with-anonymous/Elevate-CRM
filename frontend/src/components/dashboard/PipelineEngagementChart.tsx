import { useState } from 'react';
import { usePipelineChart } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

import CardErrorState from '@/components/dashboard/CardErrorState';

export default function PipelineEngagementChart() {
  const [period, setPeriod] = useState<'monthly' | 'annually'>('monthly');
  const { data: chartResponse, isLoading, isError, refetch } = usePipelineChart(period);

  const dataArray = Array.isArray(chartResponse)
    ? chartResponse
    : (chartResponse?.data || []);

  const chartData = dataArray.map((d: any) => ({
    name: d.label || d.name,
    value: d.value
  }));
  const peakMonth = chartResponse?.peakMonth;
  const peakGrowth = chartResponse?.peakGrowth;

  return (
    <div className="flex h-[280px] flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Pipeline Engagement</h3>
          <p className="text-xs text-muted-foreground">New leads per {period === 'monthly' ? 'month' : 'year'}</p>
        </div>
        <div className="flex items-center rounded-lg bg-muted p-1">
          <button
            onClick={() => setPeriod('monthly')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${period === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPeriod('annually')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${period === 'annually' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Annually
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full relative">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : isError ? (
          <CardErrorState onRetry={() => refetch()} heightClass="h-full" />
        ) : (
          <>
            {/* Peak growth badge */}
            <AnimatePresence>
              {peakMonth && peakGrowth !== null && peakGrowth !== undefined && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-0 right-2 z-10 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400"
                >
                  Peak: {peakMonth} +{peakGrowth}%
                </motion.div>
              )}
            </AnimatePresence>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--color-border))" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 12 }}
                  dy={10}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--color-muted) / 0.4)' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-card))', boxShadow: 'var(--shadow-sm)' }}
                  itemStyle={{ color: 'hsl(var(--color-foreground))', fontWeight: 500 }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={true}>
                  {chartData?.map((entry: any, index: number) => {
                    const isPeak = entry.name === peakMonth;
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={isPeak ? 'hsl(var(--color-primary))' : 'hsl(var(--color-primary) / 0.3)'} 
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
