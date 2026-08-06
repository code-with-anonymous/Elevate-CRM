// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/searchService.ts — /api/search
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

export type SearchHitType = 'lead' | 'contact' | 'task';

/** One normalized hit — the palette renders a single row component for all types. */
export interface SearchHit {
  id: string;
  type: SearchHitType;
  title: string;
  subtitle: string | null;
  badge: string | null;
  /** In-app route to navigate to on select. */
  href: string;
}

export interface SearchResponse {
  query: string;
  groups: {
    leads: SearchHit[];
    contacts: SearchHit[];
    tasks: SearchHit[];
  };
  total: number;
}

/** Below this the server returns an empty result rather than matching everything. */
export const MIN_SEARCH_LENGTH = 2;

export const searchService = {
  search: async (q: string): Promise<SearchResponse> => {
    const res = await axiosInstance.get(`/search?q=${encodeURIComponent(q)}`);
    return res.data.data;
  },
};
