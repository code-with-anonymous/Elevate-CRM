// ─────────────────────────────────────────────────────────────────────────────
// src/components/leads/AIEmailModal.tsx
//
// Drafts an outreach email for one lead. Draft only — nothing is sent. The
// generated subject and body land in editable fields, because a draft you can't
// take out of the box is a demo, not a feature.
//
// Chrome is InviteMemberModal's: bg-overlay scrim, Field/controlClass inputs,
// the shared Button — but centred with flex rather than that modal's
// left-1/2/-translate-x-1/2, which Framer's inline transform overwrites (see the
// wrapper below). Reachable both from the
// AI summary drawer's footer and directly from a leads-table row action, which
// is why it's a sibling of the drawer rather than nested inside it — nesting
// would also fight the z-40/z-50 pair the scrim and panel already occupy.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Copy, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, controlClass, selectClass } from '@/components/ui/field';
import { useLeadAIEmail } from '@/hooks/useLeads';
import { DURATION, EASE_OUT, overlayVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

// Values must match the server's EMAIL_PURPOSES / EMAIL_TONES keys in
// backend/services/ai.service.js — the controller rejects anything else with a
// 400 rather than letting request text reach the prompt's instruction position.
export const AI_PURPOSES = [
  { value: 'introduction', label: 'Introduction / cold outreach' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'proposal', label: 'Send a proposal' },
  { value: 'check-in', label: 'Check in after no response' },
  { value: 're-engage', label: 'Re-engage a cold lead' },
  { value: 'thank-you', label: 'Thank you & next steps' },
];

export const AI_TONES = [
  { value: 'friendly', label: 'Friendly & professional' },
  { value: 'formal', label: 'Formal' },
  { value: 'concise', label: 'Concise & direct' },
  { value: 'warm', label: 'Warm & casual' },
];

interface AIEmailModalProps {
  /** The lead to draft for. Null closes the modal. */
  lead: any | null;
  onClose: () => void;
}

export default function AIEmailModal({ lead, onClose }: AIEmailModalProps) {
  const isOpen = Boolean(lead);
  const leadId = lead?.id || lead?._id;

  const [purpose, setPurpose] = useState('follow-up');
  const [tone, setTone] = useState('friendly');

  // Held locally rather than read straight off the mutation so the user can edit
  // the draft without their changes being blown away on the next render.
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);

  const emailMutation = useLeadAIEmail();

  // Keyed on the lead, not just open/closed, so switching leads without an
  // intervening close cannot carry one lead's draft over to another.
  useEffect(() => {
    emailMutation.reset();
    setSubject('');
    setBody('');
    setCopied(false);
    setPurpose('follow-up');
    setTone('friendly');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const generate = () => {
    if (!leadId) return;
    setCopied(false);
    emailMutation.mutate(
      { id: leadId, purpose, tone },
      {
        onSuccess: (data) => {
          setSubject(data.subject);
          setBody(data.body);
        },
      }
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      toast.success('Email copied to clipboard');
    } catch {
      // Clipboard needs a secure context — http on a LAN IP will land here.
      toast.error('Could not copy. Select the text and copy manually.');
    }
  };

  const hasDraft = Boolean(subject || body);
  const errorMessage =
    emailMutation.error?.response?.data?.message || 'Could not draft this email.';

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

          {/* Centring lives on this static wrapper, never on the panel itself.
              Framer writes `transform` inline and collapses it to `none` once
              scale/y settle at their defaults, which silently drops any
              -translate-x-1/2 the panel carries and parks it below-right of
              centre. Flex centring uses no transform, so nothing to clobber.
              pointer-events-none keeps the scrim's click-to-close working
              through the padding gutter. */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
              role="dialog"
              aria-modal="true"
              aria-label="AI email generator"
              className="pointer-events-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-pop"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles size={14} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                      AI Email Generator
                    </h2>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      Draft an email to {lead.firstName} {lead.lastName}
                    </p>
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

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Purpose" htmlFor="aiEmailPurpose">
                    <select
                      id="aiEmailPurpose"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className={selectClass}
                    >
                      {AI_PURPOSES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Tone" htmlFor="aiEmailTone">
                    <select
                      id="aiEmailTone"
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className={selectClass}
                    >
                      {AI_TONES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {!hasDraft && (
                  <Button
                    type="button"
                    className="w-full"
                    isLoading={emailMutation.isPending}
                    onClick={generate}
                  >
                    <Sparkles size={14} />
                    Generate email
                  </Button>
                )}

                {emailMutation.isError && (
                  <p className="text-center text-xs font-medium text-destructive">
                    {errorMessage}
                  </p>
                )}

                {hasDraft && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION.normal, ease: EASE_OUT }}
                    className="space-y-3"
                  >
                    <Field label="Subject" htmlFor="aiEmailSubject">
                      <input
                        id="aiEmailSubject"
                        type="text"
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value);
                          setCopied(false);
                        }}
                        className={controlClass}
                      />
                    </Field>

                    <Field label="Body" htmlFor="aiEmailBody" hint="Edit freely before sending.">
                      <textarea
                        id="aiEmailBody"
                        rows={11}
                        value={body}
                        onChange={(e) => {
                          setBody(e.target.value);
                          setCopied(false);
                        }}
                        className={cn(controlClass, 'h-auto resize-y py-2 leading-relaxed')}
                      />
                    </Field>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        isLoading={emailMutation.isPending}
                        onClick={generate}
                      >
                        <RefreshCw size={14} />
                        Regenerate
                      </Button>
                      <Button type="button" className="flex-1" onClick={copy}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 border-t border-border/60 px-5 py-3">
                <Sparkles size={13} className="text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">Generated by Google Gemini</p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
