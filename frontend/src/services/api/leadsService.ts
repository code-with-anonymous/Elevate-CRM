import axiosInstance from './axiosInstance';

export const leadsService = {
  createLead: async (data: any) => {
    const res = await axiosInstance.post('/leads', data);
    return res.data.data;
  },
  getOrgUsers: async () => {
    const res = await axiosInstance.get('/leads/users');
    return res.data.data;
  }
};
