// ─────────────────────────────────────────────────────────────────────────────
// hooks/useDeals.ts
// TanStack Query hooks for deal CRUD + stage move
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dealService, type CreateDealPayload, type DealStage, type GetDealsParams, type UpdateDealPayload } from '@services/api/dealService';
import { CALENDAR_QK } from '@hooks/useCalendar';
import toast from 'react-hot-toast';

// ── Query keys ────────────────────────────────────────────────────────────────

export const DEALS_QK = {
  all:    ['deals'] as const,
  list:   (params?: GetDealsParams) => [...DEALS_QK.all, 'list', params] as const,
  detail: (id: string) => [...DEALS_QK.all, 'detail', id] as const,
};

// ── List ──────────────────────────────────────────────────────────────────────

export function useDeals(params?: GetDealsParams) {
  return useQuery({
    queryKey:  DEALS_QK.list(params),
    queryFn:   () => dealService.getDeals(params),
    staleTime: 1000 * 30,
  });
}

// ── Single deal ───────────────────────────────────────────────────────────────

export function useDeal(id: string) {
  return useQuery({
    queryKey:  DEALS_QK.detail(id),
    queryFn:   () => dealService.getDeal(id),
    enabled:   Boolean(id),
    staleTime: 1000 * 30,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDealPayload) => dealService.createDeal(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEALS_QK.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: CALENDAR_QK.all });
      toast.success('Deal created');
    },
    onError: () => toast.error('Failed to create deal'),
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateDeal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateDealPayload) => dealService.updateDeal(id, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: DEALS_QK.all });
      qc.setQueryData(DEALS_QK.detail(id), updated);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: CALENDAR_QK.all });
      toast.success('Deal updated');
    },
    onError: () => toast.error('Failed to update deal'),
  });
}

// ── Stage move (drag-drop) ────────────────────────────────────────────────────

export function useMoveDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
      dealService.moveDealStage(id, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEALS_QK.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: CALENDAR_QK.all });
    },
    onError: () => {
      // Revert optimistic update
      qc.invalidateQueries({ queryKey: DEALS_QK.all });
      toast.error('Failed to move deal — changes reverted');
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dealService.deleteDeal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEALS_QK.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: CALENDAR_QK.all });
      toast.success('Deal deleted');
    },
    onError: () => toast.error('Failed to delete deal'),
  });
}
