// ─────────────────────────────────────────────────────────────────────────────
// hooks/useOrganization.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  organizationService,
  type UpdateOrganizationPayload,
} from '@services/api/organizationService';

export const ORG_QK = {
  all: ['organization'] as const,
  current: () => [...ORG_QK.all, 'current'] as const,
};

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
}

export function useOrganization() {
  return useQuery({
    queryKey: ORG_QK.current(),
    queryFn: () => organizationService.getCurrent(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationPayload) => organizationService.update(data),
    onSuccess: (org) => {
      toast.success('Organization saved');
      // Write the fresh doc straight into the cache instead of invalidating —
      // the PATCH response IS the new state, so a refetch would be a second
      // round trip for data already in hand.
      //
      // No authStore sync: nothing in the layout reads `organization` from
      // Zustand today. If a sidebar org header lands later, that's the moment
      // to add a setOrganization action — not before.
      qc.setQueryData(ORG_QK.current(), org);
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save organization')),
  });
}
