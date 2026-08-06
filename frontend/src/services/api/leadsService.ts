import axiosInstance from './axiosInstance';

export interface LeadFilterParams {
  page?: number;
  limit?: number;
  status?: string;
  source?: string;
  search?: string;
  assignedTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const leadsService = {
  getLeads: async (params: LeadFilterParams = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    });
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await axiosInstance.get(`/leads${query}`);
    return res.data.data;
  },

  getLead: async (id: string) => {
    const res = await axiosInstance.get(`/leads/${id}`);
    return res.data.data;
  },

  createLead: async (data: any) => {
    const res = await axiosInstance.post('/leads', data);
    return res.data.data;
  },

  updateLead: async (id: string, data: any) => {
    const res = await axiosInstance.patch(`/leads/${id}`, data);
    return res.data.data;
  },

  deleteLead: async (id: string) => {
    const res = await axiosInstance.delete(`/leads/${id}`);
    return res.data.data;
  },

  updateLeadStatus: async (id: string, status: string) => {
    const res = await axiosInstance.patch(`/leads/${id}/status`, { status });
    return res.data.data;
  },

  getOrgUsers: async () => {
    const res = await axiosInstance.get('/leads/users');
    return res.data.data;
  },
};
