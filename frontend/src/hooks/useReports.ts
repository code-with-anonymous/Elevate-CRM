// ─────────────────────────────────────────────────────────────────────────────
// hooks/useReports.ts
// One hook per report. Each takes an `enabled` flag so a tabbed Reports page
// only fetches the tab you're looking at — four aggregation endpoints firing on
// mount would make the page slow to open and three of the four wasted.
//
// Results stay cached per tab, so switching back is instant.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { reportsService, type DateRangeParams } from '@services/api/reportsService';

// ── Query keys ────────────────────────────────────────────────────────────────
// `all` prefix so a future mutation can invalidate every report at once.

export const REPORTS_QK = {
  all: ['reports'] as const,
  salesPerformance: (params: DateRangeParams & { assignedTo?: string }) =>
    [...REPORTS_QK.all, 'sales-performance', params] as const,
  pipelineForecast: () => [...REPORTS_QK.all, 'pipeline-forecast'] as const,
  leadSourceRoi: (params: DateRangeParams) => [...REPORTS_QK.all, 'lead-source-roi', params] as const,
  activitySummary: (params: DateRangeParams) =>
    [...REPORTS_QK.all, 'activity-summary', params] as const,
};

// Aggregations are expensive and the underlying numbers move slowly — a longer
// stale window than the record lists (which use 30-60s).
const STALE = 1000 * 60 * 5;

export function useSalesPerformance(
  params: DateRangeParams & { assignedTo?: string },
  enabled = true
) {
  return useQuery({
    queryKey: REPORTS_QK.salesPerformance(params),
    queryFn: () => reportsService.getSalesPerformance(params),
    staleTime: STALE,
    enabled,
  });
}

export function usePipelineForecast(enabled = true) {
  return useQuery({
    queryKey: REPORTS_QK.pipelineForecast(),
    queryFn: () => reportsService.getPipelineForecast(),
    staleTime: STALE,
    enabled,
  });
}

export function useLeadSourceRoi(params: DateRangeParams, enabled = true) {
  return useQuery({
    queryKey: REPORTS_QK.leadSourceRoi(params),
    queryFn: () => reportsService.getLeadSourceRoi(params),
    staleTime: STALE,
    enabled,
  });
}

export function useActivitySummary(params: DateRangeParams, enabled = true) {
  return useQuery({
    queryKey: REPORTS_QK.activitySummary(params),
    queryFn: () => reportsService.getActivitySummary(params),
    staleTime: STALE,
    enabled,
  });
}
