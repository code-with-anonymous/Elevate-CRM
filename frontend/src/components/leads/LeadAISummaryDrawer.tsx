// ─────────────────────────────────────────────────────────────────────────────
// src/components/leads/LeadAISummaryDrawer.tsx
//
// A rep's 10-second read on one lead: what this is, how likely it is to die,
// how urgently to act, and the single next thing to do.
//
// Shell is AddLeadDrawer's, form stripped out. Body is AIInsightsCard's
// idle → loading → error → data state machine, since that card already
// established what a generative surface looks like here (Sparkles in a
// bg-primary/10 square, "Powered by Gemini", the aurora border while live).
//
// Nothing is cached server-side: each open is a fresh Gemini call, because a
// stored summary goes stale the moment someone changes the status, value or
// notes, and there are four such triggers to miss. TanStack Query holds the
// result for as long as the drawer is open, which is the only span that matters.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Loader2, Mail, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeadAISummary } from '@/hooks/useLeads';
import { DURATION, EASE_OUT, drawerVariants, overlayVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

interface LeadAISummaryDrawerProps {
  /** The lead to analyse. Null closes the drawer. */
  lead: any | null;
  onClose: () => void;
  /** Hands off to AIEmailModal. The parent closes this drawer and opens that. */
  onGenerateEmail: (lead: any) => void;
}

/**
 * riskScore is the chance of LOSING the deal, so low is good. Same thresholds as
 * StatusBadge's tone vocabulary, to keep one meaning for these colours.
 */
function riskTone(score: number) {
  if (score < 34) return 'text-status-positive';
  if (score <= 66) return 'text-status-warn';
  return 'text-destructive';
}

/** Priority is urgency, and urgency reads as warm, not as danger. */
function priorityTone(priority: string) {
  if (priority === 'High') return 'text-status-warn';
  if (priority === 'Low') return 'text-muted-foreground';
  return 'text-foreground';
}

export default function LeadAISummaryDrawer({
  lead,
  onClose,
  onGenerateEmail,
}: LeadAISummaryDrawerProps) {
  const isOpen = Boolean(lead);
  const leadId = lead?.id || lead?._id;

  const summaryMutation = useLeadAISummary();
  const { data, isPending, isError, mutate, reset } = summaryMutation;

  // Analyse as soon as the drawer opens — the rep clicked a Sparkles button, so
  // asking them to click a second one to actually run it is friction. Keyed on
  // leadId so opening a different row re-runs instead of showing the last lead.
  useEffect(() => {
    if (!leadId) {
      // Clear on close so the next open starts empty rather than flashing the
      // previous lead's numbers behind the new request.
      reset();
      return;
    }
    reset();
    mutate(leadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const errorMessage =
    summaryMutation.error?.response?.data?.message || 'Could not analyse this lead.';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-[2px]"
          />

          <motion.div
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="AI lead summary"
            className="fixed bottom-0 right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border/60 bg-card shadow-pop"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-6 py-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles size={14} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    AI Lead Summary
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Powered by Gemini</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <AnimatePresence mode="wait">
                {isPending && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATION.fast }}
                    className="flex h-full flex-col items-center justify-center gap-2.5"
                  >
                    <Loader2 className="animate-spin text-primary" size={20} />
                    <p className="text-xs text-muted-foreground">Reading this lead…</p>
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
                    <p className="max-w-[32ch] text-xs font-medium text-destructive">
                      {errorMessage}
                    </p>
                    <button
                      type="button"
                      onClick={() => mutate(leadId)}
                      className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline"
                    >
                      Try again
                    </button>
                  </motion.div>
                )}

                {data && !isPending && (
                  <motion.div
                    key="data"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATION.normal, ease: EASE_OUT }}
                    className="space-y-4"
                  >
                    {/* whitespace-pre-wrap, not a markdown renderer — the prompt
                        forbids markdown so there is nothing to parse. */}
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                      {data.summary}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Risk score
                        </p>
                        <p className="mt-1 text-xl font-semibold tabular-nums leading-none">
                          <span className={riskTone(data.riskScore)}>{data.riskScore}</span>
                          <span className="text-xs font-normal text-muted-foreground">/100</span>
                        </p>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Suggested priority
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-xl font-semibold leading-none',
                            priorityTone(data.priority)
                          )}
                        >
                          {data.priority}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
                      <Info size={13} className="mt-0.5 shrink-0 text-status-info" />
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                        <span className="font-semibold">Next best action: </span>
                        {data.nextBestAction}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer stays docked so the handoff is always reachable */}
            <div className="border-t border-border/60 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => onGenerateEmail(lead)}
              >
                <Mail size={14} />
                Generate AI email
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
