// ─────────────────────────────────────────────────────────────────────────────
// pages/pipeline/PipelinePage.tsx
// Kanban board wired to /api/deals with live drag-drop stage moves
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { Helmet }            from 'react-helmet-async';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { useDeals, useCreateDeal, useDeleteDeal } from '@hooks/useDeals';
import { usePipelineDrag }                        from '@hooks/usePipelineDrag';
import type { Deal, DealStage }                   from '@services/api/dealService';

import {
  Plus,
  Trash2,
  DollarSign,
  Calendar,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  GripVertical,
} from 'lucide-react';

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGES: { key: DealStage; label: string; color: string; bg: string; border: string }[] = [
  { key: 'Lead',          label: 'Lead',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  { key: 'Qualified',     label: 'Qualified',     color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  { key: 'Proposal Sent', label: 'Proposal Sent', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  { key: 'Negotiation',   label: 'Negotiation',   color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { key: 'Won',           label: 'Won',           color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30' },
  { key: 'Lost',          label: 'Lost',          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Deal Card ─────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  onDelete?: (id: string) => void;
}

function DealCard({ deal, isDragging = false, onDelete }: DealCardProps) {
  const cfg = STAGES.find((s) => s.key === deal.stage) ?? STAGES[0];
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group relative rounded-xl border bg-[#1a1f2e] p-4 transition-all duration-200',
        isDragging
          ? 'rotate-2 scale-105 shadow-2xl border-violet-500/60 opacity-90'
          : 'border-white/8 hover:border-white/20 hover:shadow-lg hover:-translate-y-0.5',
      ].join(' ')}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="absolute right-8 top-2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground/60 hover:text-muted-foreground transition-all"
        title="Drag to move"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Stage pill */}
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.color} mb-2`}>
        {deal.stage}
      </span>

      <h4 className="text-sm font-semibold text-white leading-snug mb-2 pr-6 line-clamp-2">
        {deal.title}
      </h4>

      {/* Value */}
      <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm mb-3">
        <DollarSign className="h-3.5 w-3.5" />
        {fmt(deal.value, deal.currency)}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {deal.assignedTo && (
          <span className="flex items-center gap-1">
            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-[9px] font-bold text-white">
              {initials(`${deal.assignedTo.firstName} ${deal.assignedTo.lastName}`)}
            </div>
            {deal.assignedTo.firstName}
          </span>
        )}
        {deal.expectedCloseDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(deal.expectedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(deal.id); }}
          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:bg-red-500/10 transition-all"
          title="Delete deal"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  stage:   typeof STAGES[number];
  deals:   Deal[];
  onDelete: (id: string) => void;
  onAddDeal: (stage: DealStage) => void;
}

function KanbanColumn({ stage, deals, onDelete, onAddDeal }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id:   stage.key,
    data: { stage: stage.key },
  });

  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] flex-shrink-0">
      {/* Column header */}
      <div className={`flex items-center justify-between rounded-t-xl border-t border-x px-3 py-2.5 ${stage.bg} ${stage.border}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-widest ${stage.color}`}>{stage.label}</span>
          <span className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 ${stage.bg} ${stage.color} border ${stage.border}`}>
            {deals.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">{fmt(total)}</span>
          <button
            onClick={() => onAddDeal(stage.key)}
            className={`rounded-md p-1 ${stage.color} hover:${stage.bg} transition-colors`}
            title={`Add deal to ${stage.label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          'flex flex-col gap-2 rounded-b-xl border-b border-x p-2 min-h-[480px] flex-1 transition-colors duration-200',
          stage.border,
          isOver ? `${stage.bg} border-dashed` : 'bg-[#111827]/60',
        ].join(' ')}
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onDelete={onDelete} />
        ))}

        {deals.length === 0 && (
          <div className={`flex flex-col items-center justify-center h-24 rounded-lg border border-dashed ${stage.border} opacity-40 mt-2`}>
            <span className={`text-xs ${stage.color}`}>Drop here</span>
          </div>
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
  const [title,    setTitle]    = useState('');
  const [value,    setValue]    = useState('');
  const [stage,    setStage]    = useState<DealStage>(defaultStage);
  const [currency, setCurrency] = useState('USD');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !value) return;
    onSubmit({ title, value: Number(value), stage, currency });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1f2e] p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold text-white mb-5">New Deal</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Deal Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Website Redesign"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Value *</label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#1a1f2e] px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
              >
                {['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Stage</label>
            <div className="relative">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as DealStage)}
                className="w-full appearance-none rounded-lg border border-white/10 bg-[#1a1f2e] px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-muted-foreground hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 transition-all"
            >
              {isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { data, isLoading, isError } = useDeals({ limit: 500 });
  const { mutate: deleteDeal }       = useDeleteDeal();
  const { mutate: createDeal, isPending: isCreating } = useCreateDeal();

  const [modalStage, setModalStage] = useState<DealStage | null>(null);
  const [search,     setSearch]     = useState('');

  const deals = data?.deals ?? [];

  // Filter by search
  const filtered = useMemo(() =>
    search
      ? deals.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
      : deals,
    [deals, search]
  );

  // Group by stage
  const byStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      'Lead': [], 'Qualified': [], 'Proposal Sent': [],
      'Negotiation': [], 'Won': [], 'Lost': [],
    };
    filtered.forEach((d) => { if (map[d.stage]) map[d.stage].push(d); });
    return map;
  }, [filtered]);

  // Pipeline total (exclude Lost)
  const pipelineTotal = useMemo(() =>
    deals.filter((d) => d.stage !== 'Lost').reduce((s, d) => s + d.value, 0),
    [deals]
  );

  // dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { activeDeal, onDragStart, onDragOver, onDragEnd } = usePipelineDrag(deals);

  function handleDragStart(e: DragStartEvent) { onDragStart(e); }
  function handleDragOver(e: DragOverEvent)   { onDragOver(e); }
  function handleDragEnd(e: DragEndEvent)     { onDragEnd(e); }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
    </div>
  );

  if (isError) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-red-400">
      <AlertCircle className="h-10 w-10" />
      <p>Failed to load pipeline. Check your connection.</p>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Pipeline — ElevateCRM</title>
        <meta name="description" content="Visual kanban pipeline to track deal stages from Lead to Won." />
      </Helmet>

      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/8 bg-[#0d1117] px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Pipeline</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {deals.length} deal{deals.length !== 1 ? 's' : ''} ·{' '}
              <span className="text-emerald-400 font-semibold">{fmt(pipelineTotal)}</span> in pipeline
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals…"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:border-violet-500/50 focus:outline-none w-48"
            />
            <button
              onClick={() => setModalStage('Lead')}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-1.5 text-sm font-semibold text-white hover:from-violet-500 hover:to-fuchsia-500 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Deal
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-4">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 h-full pb-2">
              {STAGES.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  deals={byStage[stage.key]}
                  onDelete={(id) => deleteDeal(id)}
                  onAddDeal={(s) => setModalStage(s)}
                />
              ))}
            </div>

            {/* Drag overlay — floating card that follows cursor */}
            <DragOverlay dropAnimation={null}>
              {activeDeal ? (
                <DealCard deal={activeDeal} isDragging />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Add Deal Modal */}
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
    </>
  );
}
