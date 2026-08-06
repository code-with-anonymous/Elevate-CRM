// ─────────────────────────────────────────────────────────────────────────────
// hooks/useSearch.ts
// Debounced global search for the command palette.
//
// Two guards keep this from hammering the API on every keystroke:
//   · useDebounce(250ms) — the existing hook, same one FilterBar uses
//   · enabled: only fires at MIN_SEARCH_LENGTH or more
//
// TanStack caches per debounced term, so backspacing to a previous query is
// instant instead of a refetch.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@hooks/useDebounce';
import { MIN_SEARCH_LENGTH, searchService } from '@services/api/searchService';

export const SEARCH_QK = {
  all: ['search'] as const,
  query: (q: string) => [...SEARCH_QK.all, q] as const,
};

export function useGlobalSearch(rawQuery: string, enabled = true) {
  const query = useDebounce(rawQuery.trim(), 250);

  const result = useQuery({
    queryKey: SEARCH_QK.query(query),
    queryFn: () => searchService.search(query),
    enabled: enabled && query.length >= MIN_SEARCH_LENGTH,
    staleTime: 1000 * 30,
  });

  return {
    ...result,
    /** The term the current results actually correspond to. */
    debouncedQuery: query,
    /** True while the user has typed ahead of the debounce. */
    isTyping: rawQuery.trim() !== query,
  };
}
