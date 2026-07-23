import { useAIInsights } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AIInsightsCard() {
  const { data, isFetching, isError, refetch } = useAIInsights();

  return (
    <div className="flex min-h-[192px] h-auto flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">AI Sales Insights</h3>
            <p className="text-[10px] text-muted-foreground">Powered by Gemini</p>
          </div>
        </div>
        {!data && !isFetching && (
          <button 
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
          >
            Analyze Pipeline
          </button>
        )}
      </div>

      <div className="flex-1 px-5 pb-5">
        <AnimatePresence mode="wait">
          {!data && !isFetching && !isError && (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center text-center space-y-2"
            >
              <p className="text-xs text-muted-foreground">
                Run AI analysis to spot pipeline risks and opportunities instantly.
              </p>
            </motion.div>
          )}

          {isFetching && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center space-y-3"
            >
              <Loader2 className="animate-spin text-indigo-500" size={24} />
              <p className="animate-pulse text-xs text-muted-foreground">Analyzing pipeline data...</p>
            </motion.div>
          )}

          {isError && (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center text-destructive"
            >
              <p className="text-xs font-medium">Analysis failed.</p>
              <button onClick={() => refetch()} className="mt-2 text-xs underline">Try again</button>
            </motion.div>
          )}

          {data && !isFetching && (
            <motion.div 
              key="data"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col justify-between"
            >
              <div className="space-y-2.5 mt-2">
                {data.insights.slice(0, 3).map((insight: any, i: number) => {
                  let Icon = Info;
                  let colorClass = 'text-blue-500';
                  
                  if (insight.type === 'positive') {
                    Icon = CheckCircle2;
                    colorClass = 'text-green-500';
                  } else if (insight.type === 'warning') {
                    Icon = AlertTriangle;
                    colorClass = 'text-amber-500';
                  }

                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Icon size={14} className={`shrink-0 mt-0.5 ${colorClass}`} />
                      <p className="text-foreground leading-snug">{insight.text}</p>
                    </div>
                  );
                })}
              </div>

              {data.pipelineSummary && (
                <div className="mt-3 flex items-center justify-between rounded-md bg-muted/50 p-2 text-[10px] font-medium">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Pipeline</span>
                    <span className="text-foreground">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.pipelineSummary.value || 0)}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-muted-foreground">Top Source</span>
                    <span className="text-foreground">{data.pipelineSummary.topSource}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
