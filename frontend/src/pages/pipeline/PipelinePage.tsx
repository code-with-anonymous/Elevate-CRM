// ─────────────────────────────────────────────────────────────────────────────
// pages/pipeline/PipelinePage.tsx
// Kanban board wired to /api/deals with live drag-drop stage moves.
//
// VISUAL PASS ONLY. usePipelineDrag, the DndContext wiring, the sensors, the
// optimistic cache update and its rollback are byte-for-byte unchanged — the
// drag handle still owns the listeners, the overlay still renders the same
// card component.
//
// What changed: the board was hardcoded dark (#0d1117 / #1a1f2e / text-white)
// and ignored the theme entirely. Everything now runs on tokens, so it reads
// correctly in light and dark.
//
// Column language
//  · stage color is a 2px top rule, not a filled header
//  · count sits beside the label; column total sits under it, muted
//  · body carries a 3% wash of the stage hue so columns are distinguishable
//    without the board looking striped
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AnimatePresence, motion } from 'framer-motion';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { useCreateDeal, useDeals, useDeleteDeal } from '@hooks/useDeals';
import { usePipelineDrag } from '@hooks/usePipelineDrag';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import type { Deal, DealStage } from '@services/api/dealService';

import {
  AlertCircle,
  CalendarDays,
  GripVertical,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';

import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import PageHeader from '@/components/common/PageHeader';
import DealInsightPopover from '@/components/pipeline/DealInsightPopover';
import { Button } from '@/components/ui/button';
import { Field, controlClass, selectClass } from '@/components/ui/field';
import { formatCurrency, formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT, overlayVariants, pageVariants } from '@/lib/motion';

// ── Stage config ──────────────────────────────────────────────────────────────

interface StageConfig {
  key: DealStage;
  label: string;
  /** 2px rule across the top of the column — where the stage color lives. */
  rule: string;
  /** Wash behind the column body — deliberately near-invisible. */
  wash: string;
}

const STAGES: StageConfig[] = [
  { key: 'Lead', label: 'Lead', rule: 'bg-status-info', wash: 'bg-status-info/[0.03]' },
  { key: 'Qualified', label: 'Qualified', rule: 'bg-status-accent', wash: 'bg-status-accent/[0.03]' },
  { key: 'Proposal Sent', label: 'Proposal Sent', rule: 'bg-status-progress', wash: 'bg-status-progress/[0.03]' },
  { key: 'Negotiation', label: 'Negotiation', rule: 'bg-status-warn', wash: 'bg-status-warn/[0.03]' },
  { key: 'Won', label: 'Won', rule: 'bg-status-positive', wash: 'bg-status-positive/[0.03]' },
  { key: 'Lost', label: 'Lost', rule: 'bg-status-negative', wash: 'bg-status-negative/[0.03]' },
];

/** Past this, a column is a bottleneck worth flagging — but never blocking. */
const WIP_THRESHOLD = 10;

// ── Deal Card ─────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  onDelete?: (id: string) => void;
}

function DealCard({ deal, isDragging = false, onDelete }: DealCardProps) {
  const cfg = STAGES.find((s) => s.key === deal.stage) ?? STAGES[0];
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });
  // Dropping a card PATCHes the deal's stage, so the grip needs deals:write.
  // Leaving it for a viewer would let them drag a card across the board and
  // watch it snap back when the request 403s.
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.DEALS_WRITE);

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const company = deal.leadId?.company;
  const assignee = deal.assignedTo;

  // Anchor rect for the insight panel. Null = closed. Captured on enter rather
  // than measured by the panel so there is exactly one read of the DOM per open.
  const [insightAnchor, setInsightAnchor] = useState<DOMRect | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<number>();

  // The overlay card and any card mid-drag never show the panel: it would track
  // a stale rect, and a tooltip chasing the cursor during a drag is noise.
  const insightEnabled = !isDragging && !transform;

  const closeInsight = React.useCallback(() => {
    window.clearTimeout(openTimer.current);
    setInsightAnchor(null);
  }, []);

  const openInsight = () => {
    if (!insightEnabled) return;
    window.clearTimeout(openTimer.current);
    // Sweeping the cursor across a column shouldn't strobe six panels. The delay
    // means the panel only appears where the pointer actually settles.
    openTimer.current = window.setTimeout(() => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) setInsightAnchor(rect);
    }, 260);
  };

  React.useEffect(() => {
    if (!insightEnabled) closeInsight();
  }, [insightEnabled, closeInsight]);

  // A `fixed` panel does not follow its anchor. Rather than reposition on every
  // frame, close it — the board scrolls horizontally and the cursor has already
  // left the card by the time a scroll finishes.
  React.useEffect(() => {
    if (!insightAnchor) return;
    window.addEventListener('scroll', closeInsight, true);
    window.addEventListener('resize', closeInsight);
    return () => {
      window.removeEventListener('scroll', closeInsight, true);
      window.removeEventListener('resize', closeInsight);
    };
  }, [insightAnchor, closeInsight]);

  React.useEffect(() => () => window.clearTimeout(openTimer.current), []);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        cardRef.current = node;
      }}
      style={style}
      onPointerEnter={openInsight}
      onPointerLeave={closeInsight}
      onPointerDown={closeInsight}
      className={cn(
        'group relative rounded-xl border bg-card p-3',
        'transition-[border-color,box-shadow,transform] duration-150 ease-out',
        isDragging
          ? 'scale-[1.02] border-primary/40 shadow-lg'
          : 'border-border/60 hover:border-border hover:shadow-sm'
      )}
    >
      {/* Header. The action cluster is a real flex child, not an absolute overlay
          — the previous version pinned it over the top-right corner where the
          assignee avatar already sat, so the grip landed on top of the avatar and
          there was no readable "drag me" target. Both buttons hold their space at
          rest (row-actions animates opacity only), so revealing them shifts
          nothing. The avatar moved down to the meta row. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Company reads as the quiet label above the deal itself */}
          <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {company || cfg.label}
          </p>
          <h4 className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
            {deal.title}
          </h4>
        </div>

        <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(deal.id);
              }}
              className="row-actions flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
              title="Delete deal"
              aria-label="Delete deal"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Deliberately NOT inside row-actions: the grip is the only way to move
              a card, so hiding it until hover is what left people unsure the board
              was draggable at all. It rests at 50% and comes up to full on hover. */}
          {canWrite && (
            <button
              {...listeners}
              {...attributes}
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground opacity-50 transition duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
              title="Drag to move stage"
              aria-label={`Drag ${deal.title} to another stage`}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {assignee && (
            <AvatarWithInitials
              firstName={assignee.firstName}
              lastName={assignee.lastName}
              size="xs"
            />
          )}
          {deal.expectedCloseDate && (
            <>
              <CalendarDays size={11} className="shrink-0" />
              <span className="truncate tabular-nums">
                {new Date(deal.expectedCloseDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </>
          )}
        </span>

        {/* Value as a pill, bottom-right — the card's anchor */}
        <span
          className={cn(
            'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset',
            'bg-status-positive/10 text-status-positive ring-status-positive/20'
          )}
        >
          {formatMoney(deal.value, deal.currency)}
        </span>
      </div>

      <AnimatePresence>
        {insightAnchor && (
          <DealInsightPopover key="insight" deal={deal} anchor={insightAnchor} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  stage: StageConfig;
  deals: Deal[];
  /** Omitted when the viewer lacks deals:delete — DealCard hides its button. */
  onDelete?: (id: string) => void;
  onAddDeal: (stage: DealStage) => void;
}

function KanbanColumn({ stage, deals, onDelete, onAddDeal }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.key,
    data: { stage: stage.key },
  });
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.DEALS_WRITE);

  const total = deals.reduce((s, d) => s + d.value, 0);
  const overWip = deals.length >= WIP_THRESHOLD;

  return (
    <div className="flex w-[280px] min-w-[280px] flex-shrink-0 flex-col">
      {/* Stage color is a rule, not a fill */}
      <div className={cn('h-[2px] rounded-t-full', stage.rule)} />

      <div className="flex items-start justify-between gap-2 px-3 pb-2.5 pt-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
              {stage.label}
            </h3>
            <span className="rounded-full border border-border/60 bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {deals.length}
            </span>
            {overWip && (
              <span
                title={`${deals.length} deals — this stage is filling up`}
                className="flex items-center text-status-warn"
              >
                <TriangleAlert size={12} />
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
            {formatCurrency(total)}
          </p>
        </div>

        {canWrite && (
          <button
            onClick={() => onAddDeal(stage.key)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            title={`Add deal to ${stage.label}`}
            aria-label={`Add deal to ${stage.label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[420px] flex-1 flex-col gap-2 rounded-xl border p-2',
          'transition-colors duration-150',
          isOver
            ? 'border-dashed border-primary/40 bg-primary/[0.04]'
            : cn('border-border/50', stage.wash)
        )}
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onDelete={onDelete} />
        ))}

        {deals.length === 0 && (
          <div className="mt-1 flex h-20 items-center justify-center rounded-lg border border-dashed border-border/60">
            <span className="text-[11px] text-muted-foreground">
              {canWrite ? 'Drop a deal here' : 'No deals in this stage'}
            </span>
          </div>
        )}

        {/* Second add affordance — reaching the top of a long column is a chore */}
        {canWrite && (
          <button
            onClick={() => onAddDeal(stage.key)}
            className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-card hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add deal
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add Deal Modal ────────────────────────────────────────────────────────────

interface AddDealModalProps {
  defaultStage: DealStage;
  onClose: () => void;
  onSubmit: (data: { title: string; value: number; stage: DealStage; currency: string }) => void;
  isLoading: boolean;
}

function AddDealModal({ defaultStage, onClose, onSubmit, isLoading }: AddDealModalProps) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState<DealStage>(defaultStage);
  const [currency, setCurrency] = useState('USD');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !value) return;
    onSubmit({ title, value: Number(value), stage, currency });
  };

  return (
    <motion.div
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: DURATION.normal, ease: EASE_OUT }}
        role="dialog"
        aria-modal="true"
        aria-label="New deal"
        className="relative w-full max-w-md rounded-xl border border-border/60 bg-card shadow-pop"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight text-foreground">New deal</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <Field label="Deal title" htmlFor="deal-title" required>
            <input
              id="deal-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Website Redesign"
              required
              className={controlClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Value" htmlFor="deal-value" required>
              <input
                id="deal-value"
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                required
                className={cn(controlClass, 'tabular-nums')}
              />
            </Field>

            <Field label="Currency" htmlFor="deal-currency">
              <select
                id="deal-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={selectClass}
              >
                {['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Stage" htmlFor="deal-stage">
            <select
              id="deal-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as DealStage)}
              className={selectClass}
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={isLoading}>
              Create deal
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Board skeleton ────────────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="flex gap-4 pb-2">
      {STAGES.map((stage, si) => (
        <div key={stage.key} className="flex w-[280px] min-w-[280px] flex-col">
          <div className={cn('h-[2px] rounded-t-full opacity-40', stage.rule)} />
          <div className="space-y-1.5 px-3 pb-2.5 pt-2.5">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-14 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="flex min-h-[420px] flex-col gap-2 rounded-xl border border-border/50 p-2">
            {[...Array(si % 2 === 0 ? 3 : 2)].map((_, i) => (
              <div
                key={i}
                className="space-y-2.5 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="h-2 w-16 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="flex justify-between">
                  <div className="h-2.5 w-12 animate-pulse rounded bg-muted/60" />
                  <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { data, isLoading, isError } = useDeals({ limit: 500 });
  const { mutate: deleteDeal } = useDeleteDeal();
  const { mutate: createDeal, isPending: isCreating } = useCreateDeal();

  // Mirrors deals.routes.js — write is member+, delete is manager+.
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.DEALS_WRITE);
  const canDelete = can(PERMISSIONS.DEALS_DELETE);

  const [modalStage, setModalStage] = useState<DealStage | null>(null);
  const [search, setSearch] = useState('');

  const deals = data?.deals ?? [];

  // Filter by search
  const filtered = useMemo(
    () =>
      search ? deals.filter((d) => d.title.toLowerCase().includes(search.toLowerCase())) : deals,
    [deals, search]
  );

  // Group by stage
  const byStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      Lead: [],
      Qualified: [],
      'Proposal Sent': [],
      Negotiation: [],
      Won: [],
      Lost: [],
    };
    filtered.forEach((d) => {
      if (map[d.stage]) map[d.stage].push(d);
    });
    return map;
  }, [filtered]);

  // Pipeline total (exclude Lost)
  const pipelineTotal = useMemo(
    () => deals.filter((d) => d.stage !== 'Lost').reduce((s, d) => s + d.value, 0),
    [deals]
  );

  // dnd-kit
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { activeDeal, onDragStart, onDragOver, onDragEnd } = usePipelineDrag(deals);

  function handleDragStart(e: DragStartEvent) {
    onDragStart(e);
  }
  function handleDragOver(e: DragOverEvent) {
    onDragOver(e);
  }
  function handleDragEnd(e: DragEndEvent) {
    onDragEnd(e);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Helmet>
        <title>Pipeline — ElevateCRM</title>
        <meta
          name="description"
          content="Visual kanban pipeline to track deal stages from Lead to Won."
        />
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex max-w-[1600px] flex-col"
      >
        <PageHeader
          title="Pipeline"
          count={deals.length}
          description={`${formatCurrency(pipelineTotal)} in open pipeline`}
          className="mb-6"
          actions={
            <>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search deals…"
                  aria-label="Search deals"
                  className="h-9 w-44 rounded-lg border border-transparent bg-muted/60 pl-9 pr-3 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:bg-muted focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15 sm:w-56"
                />
              </div>
              {canWrite && (
                <Button onClick={() => setModalStage('Lead')}>
                  <Plus size={15} />
                  <span className="hidden sm:inline">Add Deal</span>
                </Button>
              )}
            </>
          }
        />

        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {isLoading ? (
            <BoardSkeleton />
          ) : isError ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-card text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Couldn't load the pipeline</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Check your connection and try again.
                </p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 pb-2">
                {STAGES.map((stage) => (
                  <KanbanColumn
                    key={stage.key}
                    stage={stage}
                    deals={byStage[stage.key]}
                    /* DealCard already treats an absent onDelete as "no delete
                       button", so withholding it is the whole gate. */
                    onDelete={canDelete ? (id) => deleteDeal(id) : undefined}
                    onAddDeal={(s) => setModalStage(s)}
                  />
                ))}
              </div>

              {/* Drag overlay — floating card that follows cursor */}
              <DragOverlay dropAnimation={null}>
                {activeDeal ? <DealCard deal={activeDeal} isDragging /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {modalStage && (
          <AddDealModal
            defaultStage={modalStage}
            onClose={() => setModalStage(null)}
            isLoading={isCreating}
            onSubmit={(data) => {
              createDeal(data, { onSuccess: () => setModalStage(null) });
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
