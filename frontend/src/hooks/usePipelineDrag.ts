// ─────────────────────────────────────────────────────────────────────────────
// hooks/usePipelineDrag.ts
// Manages @dnd-kit drag state + optimistic stage moves for the kanban board
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { useQueryClient }   from '@tanstack/react-query';
import { useMoveDealStage } from './useDeals';
import { DEALS_QK }         from './useDeals';
import type { Deal, DealStage, DealsListResponse } from '@services/api/dealService';

interface UsePipelineDragReturn {
  activeDeal: Deal | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver:  (event: DragOverEvent)  => void;
  onDragEnd:   (event: DragEndEvent)   => void;
}

export function usePipelineDrag(deals: Deal[]): UsePipelineDragReturn {
  const qc              = useQueryClient();
  const { mutate: move} = useMoveDealStage();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  /** Track which card is being dragged (for the drag overlay) */
  const onDragStart = useCallback((event: DragStartEvent) => {
    const found = deals.find((d) => d.id === event.active.id);
    setActiveDeal(found ?? null);
  }, [deals]);

  /** Allow dropping onto column containers by updating the dragged item's stage
   *  in the local cache immediately (optimistic update). */
  const onDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activeDeal) return;

    const targetStage = over.data?.current?.stage as DealStage | undefined;
    if (!targetStage || targetStage === activeDeal.stage) return;

    // Optimistically mutate every cached deals list that contains this deal
    qc.setQueriesData<DealsListResponse>(
      { queryKey: DEALS_QK.all },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          deals: old.deals.map((d) =>
            d.id === activeDeal.id ? { ...d, stage: targetStage } : d
          ),
        };
      }
    );

    // Keep activeDeal in sync so the overlay card shows the new column colour
    setActiveDeal((prev) => (prev ? { ...prev, stage: targetStage } : prev));
  }, [activeDeal, qc]);

  /** On drop: persist the stage move to the server */
  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { over, active } = event;
    setActiveDeal(null);

    if (!over) {
      // Dropped outside — revert
      qc.invalidateQueries({ queryKey: DEALS_QK.all });
      return;
    }

    const targetStage = over.data?.current?.stage as DealStage | undefined;
    const dealId      = active.id as string;
    const original    = deals.find((d) => d.id === dealId);

    if (!targetStage || !original || targetStage === original.stage) return;

    move({ id: dealId, stage: targetStage });
  }, [deals, move, qc]);

  return { activeDeal, onDragStart, onDragOver, onDragEnd };
}
