// ─────────────────────────────────────────────────────────────────────────────
// src/components/dashboard/AIInsightsCard.tsx
// The one card that's allowed to look alive. A slow conic gradient traces the
// border (`.aurora-border`, 8s) to mark it as the generative surface — and it
// only spins while there's something to say, so idle state stays quiet.
// ─────────────────────────────────────────────────────────────────────────────
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles } from 'lucide-react';
import { useAIInsights } from '@/hooks/useDashboard';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';

const INSIGHT_STYLES = {
  positive: { Icon: CheckCircle2, className: 'text-status-positive' },
  warning: { Icon: AlertTriangle, className: 'text-status-warn' },
  default: { Icon: Info, className: 'text-status-info' },
} as const;

export default function AIInsightsCard() {
  const { data, isFetching, isError, refetch } = useAIInsights();

  const live = Boolean(data) || isFetching;

  return (
    <div
      className={cn(
        'relative flex h-auto min-h-[192px] flex-col overflow-hidden rounded-xl bg-card',
        'transition-shadow duration-200 ease-out',
        live ? 'aurora-border' : 'border border-border/60 hover:shadow-md'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-6 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles size={14} />
          </span>
          <div>
            <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
              AI Sales Insights
            </h3>
            <p className="text-[11px] text-muted-foreground">Powered by Gemini</p>
          </div>
        </div>

        {!data && !isFetching && (
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors duration-150 hover:bg-primary/15"
          >
            Analyze
          </button>
        )}
      </div>

      <div className="flex-1 px-6 pb-6">
        <AnimatePresence mode="wait">
          {!data && !isFetching && !isError && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              className="flex h-full flex-col items-center justify-center text-center"
            >
              <p className="max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
                Run an analysis to surface pipeline risks and opportunities.
              </p>
            </motion.div>
          )}

          {isFetching && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              className="flex h-full flex-col items-center justify-center gap-2.5"
            >
              <Loader2 className="animate-spin text-primary" size={20} />
              <p className="text-xs text-muted-foreground">Reading your pipeline…</p>
            </motion.div>
          )}

          {isError && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              className="flex h-full flex-col items-center justify-center gap-1.5 text-center"
            >
              <p className="text-xs font-medium text-destructive">Analysis failed</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline"
              >
                Try again
              </button>
            </motion.div>
          )}

          {data && !isFetching && (
            <motion.div
              key="data"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.normal, ease: EASE_OUT }}
              className="flex h-full flex-col justify-between"
            >
              <ul className="space-y-2.5">
                {data.insights.slice(0, 3).map((insight: any, i: number) => {
                  const { Icon, className } =
                    INSIGHT_STYLES[insight.type as keyof typeof INSIGHT_STYLES] ??
                    INSIGHT_STYLES.default;

                  return (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: DURATION.normal,
                        ease: EASE_OUT,
                        delay: i * 0.05,
                      }}
                      className="flex items-start gap-2"
                    >
                      <Icon size={13} className={cn('mt-0.5 shrink-0', className)} />
                      <p className="text-xs leading-relaxed text-foreground">
                        {insight.text}
                      </p>
                    </motion.li>
                  );
                })}
              </ul>

              {data.pipelineSummary && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pipeline
                    </p>
                    <p className="truncate text-xs font-medium tabular-nums text-foreground">
                      {formatCurrency(data.pipelineSummary.value)}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Top source
                    </p>
                    <p className="truncate text-xs font-medium text-foreground">
                      {data.pipelineSummary.topSource}
                    </p>
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
