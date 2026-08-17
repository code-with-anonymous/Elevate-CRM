import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  leadsService,
  type LeadAIEmail,
  type LeadAISummary,
  type LeadFilterParams,
} from '@/services/api/leadsService';
import toast from 'react-hot-toast';

export function useLeadsList(filters: LeadFilterParams = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => leadsService.getLeads(filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsService.getLead(id),
    enabled: Boolean(id),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => leadsService.createLead(data),
    onSuccess: () => {
      toast.success('Lead created successfully');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create lead');
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => leadsService.updateLead(id, data),
    onSuccess: (_, variables) => {
      toast.success('Lead updated successfully');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update lead');
    },
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      leadsService.updateLeadStatus(id, status),
    onSuccess: (_, variables) => {
      toast.success('Lead status updated');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update lead status');
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsService.deleteLead(id),
    onSuccess: () => {
      toast.success('Lead deleted');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete lead');
    },
  });
}

// ── AI ────────────────────────────────────────────────────────────────────────
// Mutations, not useQuery({ enabled: false }) like useDashboard's useAIInsights.
// That one is a singleton keyed to the whole org; these are per-lead, and a
// per-lead query key read through one shared drawer would flash the previous
// lead's summary on open and need a manual remove() on close. A mutation gives
// isPending / error / data / reset() and matches the POST semantics.
//
// Neither hook toasts on error. axiosInstance's response interceptor already
// fires a global "server error" toast for every status >= 500, which our
// 502/503/504 all are — a hook-level toast would double up on every failure.
// The drawer and modal render inline error states instead, like AIInsightsCard.

export function useLeadAISummary() {
  return useMutation<LeadAISummary, any, string>({
    mutationFn: (id: string) => leadsService.getAISummary(id),
  });
}

export function useLeadAIEmail() {
  return useMutation<LeadAIEmail, any, { id: string; purpose: string; tone: string }>({
    mutationFn: ({ id, purpose, tone }) =>
      leadsService.generateAIEmail(id, { purpose, tone }),
  });
}
