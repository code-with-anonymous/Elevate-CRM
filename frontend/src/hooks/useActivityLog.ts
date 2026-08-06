// ─────────────────────────────────────────────────────────────────────────────
// hooks/useActivityLog.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { activityService, type ActivityLogParams } from '@services/api/activityService';

export const ACTIVITY_QK = {
  all: ['activity-log'] as const,
  list: (params: ActivityLogParams) => [...ACTIVITY_QK.all, params] as const,
};

export function useActivityLog(params: ActivityLogParams = {}) {
  return useQuery({
    queryKey: ACTIVITY_QK.list(params),
    queryFn: () => activityService.getActivityLog(params),
    // The feed is derived from timestamps on records the user is already
    // mutating elsewhere, so it goes stale quickly — but it's a $unionWith over
    // four collections, so refetching it aggressively isn't free either.
    staleTime: 1000 * 60,
    // Keeps the previous page rendered while the next loads, so paging doesn't
    // collapse the timeline to a spinner.
    placeholderData: (prev) => prev,
  });
}
