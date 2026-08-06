// ─────────────────────────────────────────────────────────────────────────────
// services/api/dealService.ts
// REST client for /api/deals
// ─────────────────────────────────────────────────────────────────────────────

import axiosInstance from './axiosInstance';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DealStage =
  | 'Lead'
  | 'Qualified'
  | 'Proposal Sent'
  | 'Negotiation'
  | 'Won'
  | 'Lost';

export interface DealAssignee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Deal {
  id: string;
  organizationId: string;
  title: string;
  value: number;
  currency: string;
  stage: DealStage;
  expectedCloseDate: string | null;
  closedAt: string | null;
  assignedTo: DealAssignee | null;
  leadId: { id: string; firstName: string; lastName: string; company?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealsListResponse {
  deals: Deal[];
  total: number;
  page: number;
  limit: number;
}

export interface GetDealsParams {
  stage?: DealStage;
  assignedTo?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface CreateDealPayload {
  title: string;
  value: number;
  stage?: DealStage;
  expectedCloseDate?: string | null;
  currency?: string;
  assignedTo?: string | null;
  leadId?: string | null;
}

export type UpdateDealPayload = Partial<CreateDealPayload>;

// ── API calls ─────────────────────────────────────────────────────────────────

export const dealService = {
  /** Fetch all deals (optionally filtered). Kanban passes no stage filter to get all. */
  getDeals: async (params?: GetDealsParams): Promise<DealsListResponse> => {
    const res = await axiosInstance.get('/deals', { params });
    return res.data.data;
  },

  getDeal: async (id: string): Promise<Deal> => {
    const res = await axiosInstance.get(`/deals/${id}`);
    return res.data.data;
  },

  createDeal: async (payload: CreateDealPayload): Promise<Deal> => {
    const res = await axiosInstance.post('/deals', payload);
    return res.data.data;
  },

  updateDeal: async (id: string, payload: UpdateDealPayload): Promise<Deal> => {
    const res = await axiosInstance.patch(`/deals/${id}`, payload);
    return res.data.data;
  },

  /** Dedicated stage-move call — used by drag-drop to keep mutation lean */
  moveDealStage: async (id: string, stage: DealStage): Promise<Deal> => {
    const res = await axiosInstance.patch(`/deals/${id}/stage`, { stage });
    return res.data.data;
  },

  deleteDeal: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/deals/${id}`);
  },
};
