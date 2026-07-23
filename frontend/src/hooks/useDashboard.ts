// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useDashboard.ts
// TanStack Query hooks for dashboard data
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/api/dashboardService';

export function useStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardService.getStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useFollowUps() {
  return useQuery({
    queryKey: ['dashboard', 'follow-ups'],
    queryFn: () => dashboardService.getFollowUps(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function usePipelineChart(period: 'monthly' | 'annually') {
  return useQuery({
    queryKey: ['dashboard', 'pipeline-chart', period],
    queryFn: () => dashboardService.getPipelineChart(period),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useLeadActivity() {
  return useQuery({
    queryKey: ['dashboard', 'lead-activity'],
    queryFn: () => dashboardService.getLeadActivity(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useLeadsBySource() {
  return useQuery({
    queryKey: ['dashboard', 'leads-by-source'],
    queryFn: () => dashboardService.getLeadsBySource(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useRevenueTrend() {
  return useQuery({
    queryKey: ['dashboard', 'revenue-trend'],
    queryFn: () => dashboardService.getRevenueTrend(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useAIInsights() {
  return useQuery({
    queryKey: ['dashboard', 'ai-insights'],
    queryFn: () => dashboardService.getAIInsights(),
    enabled: false, // only fetches when user clicks "Analyze pipeline"
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
