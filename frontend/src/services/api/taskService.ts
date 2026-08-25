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

/**
 * What the API accepts on POST /tasks and PATCH /tasks/:id.
 *
 * This is NOT `Partial<TaskItem>`, and the difference is the whole reason
 * assignment could not be expressed before: a response carries `assignedTo` as a
 * POPULATED user object, while a write takes a bare user id. Typing writes as
 * `Partial<TaskItem>` therefore demanded `{ id, firstName, lastName, avatarUrl }`
 * where the server wants `"6a7c…"`, so `assignedTo: userId` was a type error and
 * there was no legal way to assign a task from the client at all.
 *
 * Field list mirrors `allowedFields` in backend/controllers/tasks.controller.js —
 * anything absent there is silently dropped, so it is absent here too.
 */
export interface TaskWritePayload {
  title?: string;
  description?: string | null;
  priority?: TaskItem['priority'];
  status?: TaskItem['status'];
  dueDate?: string | null;
  /** User id to assign to, or `null` to unassign. */
  assignedTo?: string | null;
  relatedTo?: string | null;
  relatedModel?: TaskItem['relatedModel'];
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

  createTask: async (data: TaskWritePayload): Promise<TaskItem> => {
    const res = await axiosInstance.post('/tasks', data);
    return res.data.data;
  },

  updateTask: async (id: string, data: TaskWritePayload): Promise<TaskItem> => {
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
