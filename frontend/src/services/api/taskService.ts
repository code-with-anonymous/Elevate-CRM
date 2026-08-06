import axiosInstance from './axiosInstance';

export interface TaskItem {
  id: string;
  _id?: string;
  organizationId: string;
  title: string;
  description?: string | null;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Done';
  dueDate?: string | null;
  completedAt?: string | null;
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  } | null;
  relatedTo?: {
    id: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    company?: string;
  } | null;
  relatedModel?: 'Lead' | 'Deal' | 'Contact' | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetTasksParams {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  assignedTo?: string;
  relatedTo?: string;
  overdue?: boolean;
  search?: string;
  sort?: string;
}

export interface GetTasksResponse {
  tasks: TaskItem[];
  total: number;
  page: number;
  limit: number;
}

export const taskService = {
  getTasks: async (params: GetTasksParams = {}): Promise<GetTasksResponse> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    });
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await axiosInstance.get(`/tasks${query}`);
    return res.data.data;
  },

  getTask: async (id: string): Promise<TaskItem> => {
    const res = await axiosInstance.get(`/tasks/${id}`);
    return res.data.data;
  },

  createTask: async (data: Partial<TaskItem>): Promise<TaskItem> => {
    const res = await axiosInstance.post('/tasks', data);
    return res.data.data;
  },

  updateTask: async (id: string, data: Partial<TaskItem>): Promise<TaskItem> => {
    const res = await axiosInstance.patch(`/tasks/${id}`, data);
    return res.data.data;
  },

  completeTask: async (id: string): Promise<TaskItem> => {
    const res = await axiosInstance.patch(`/tasks/${id}/complete`);
    return res.data.data;
  },

  deleteTask: async (id: string): Promise<void> => {
    const res = await axiosInstance.delete(`/tasks/${id}`);
    return res.data.data;
  },
};
