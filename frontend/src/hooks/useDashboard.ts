// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useDashboard.ts
// TanStack Query hooks for dashboard data
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/api/dashboardService';
import { useDashboardStore } from '@/store/dashboardStore';

export function useStats() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  return useQuery({
    queryKey: ['dashboard', 'stats', dateRange],
    queryFn: () => dashboardService.getStats(dateRange),
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
  const dateRange = useDashboardStore((s) => s.dateRange);
  return useQuery({
    queryKey: ['dashboard', 'pipeline-chart', period, dateRange],
    queryFn: () => dashboardService.getPipelineChart(period, dateRange),
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
  const dateRange = useDashboardStore((s) => s.dateRange);
  return useQuery({
    queryKey: ['dashboard', 'leads-by-source', dateRange],
    queryFn: () => dashboardService.getLeadsBySource(dateRange),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useRevenueTrend() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  return useQuery({
    queryKey: ['dashboard', 'revenue-trend', dateRange],
    queryFn: () => dashboardService.getRevenueTrend(dateRange),
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
