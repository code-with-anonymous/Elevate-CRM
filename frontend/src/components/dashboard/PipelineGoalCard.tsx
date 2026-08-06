import { ArrowUpRight, Zap, Signal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStats } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';

import CardErrorState from '@/components/dashboard/CardErrorState';

export default function PipelineGoalCard() {
  const { data, isLoading, isError, refetch } = useStats();

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl border border-border" />;
  }

  if (isError) {
    return <CardErrorState onRetry={() => refetch()} heightClass="h-48" />;
  }

  return (
    <div className="group relative h-48 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Pipeline Goal</h3>
          <p className="text-xs text-muted-foreground">Total deal value</p>
        </div>
        <button className="text-muted-foreground transition-colors hover:text-foreground">
          <ArrowUpRight size={16} />
        </button>
      </div>

      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative flex h-[104px] w-full flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 p-3 shadow-inner"
      >
        <div className="flex items-center justify-between text-white/80">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Zap size={14} className="text-blue-400" />
            TTP CRM
          </div>
          <Signal size={14} />
        </div>
        
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/60">Pipeline value</p>
          <div className="text-2xl font-bold tracking-tight text-white">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data?.pipelineValue || 0)}
          </div>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-white/80">
          <span className="tracking-[0.2em] text-white/40">·····</span> PIPELINE
          <span className="ml-2 flex items-center gap-1.5">
            LIVE
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            </span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
