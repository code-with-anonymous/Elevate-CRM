import axiosInstance from './axiosInstance';

export interface Contact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  status: 'active' | 'inactive' | 'churned';
  notes?: string;
  tags?: string[];
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  leadId?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  dealId?: {
    id: string;
    title: string;
    stage: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetContactsParams {
  page?: number;
  limit?: number;
  status?: string;
  company?: string;
  assignedTo?: string;
  search?: string;
  tags?: string | string[];
  sort?: string;
}

export interface GetContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
}

export const contactService = {
  getContacts: async (params: GetContactsParams = {}): Promise<GetContactsResponse> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    });
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await axiosInstance.get(`/contacts${query}`);
    return res.data.data;
  },

  getContact: async (id: string): Promise<Contact> => {
    const res = await axiosInstance.get(`/contacts/${id}`);
    return res.data.data;
  },

  createContact: async (data: Partial<Contact>): Promise<Contact> => {
    const res = await axiosInstance.post('/contacts', data);
    return res.data.data;
  },

  updateContact: async (id: string, data: Partial<Contact>): Promise<Contact> => {
    const res = await axiosInstance.patch(`/contacts/${id}`, data);
    return res.data.data;
  },

  deleteContact: async (id: string): Promise<void> => {
    const res = await axiosInstance.delete(`/contacts/${id}`);
    return res.data.data;
  },
};
