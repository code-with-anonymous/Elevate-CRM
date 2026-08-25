import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  taskService,
  GetTasksParams,
  TaskWritePayload,
} from '@/services/api/taskService';
import { CALENDAR_QK } from '@/hooks/useCalendar';
import toast from 'react-hot-toast';

export const TASKS_QK = {
  all: ['tasks'] as const,
  list: (params?: GetTasksParams) => [...TASKS_QK.all, 'list', params] as const,
  detail: (id: string) => [...TASKS_QK.all, 'detail', id] as const,
};

export function useTasksList(params?: GetTasksParams) {
  return useQuery({
    queryKey: TASKS_QK.list(params),
    queryFn: () => taskService.getTasks(params),
    staleTime: 1000 * 60,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: TASKS_QK.detail(id),
    queryFn: () => taskService.getTask(id),
    enabled: Boolean(id),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskWritePayload) => taskService.createTask(data),
    onSuccess: () => {
      toast.success('Task created');
      queryClient.invalidateQueries({ queryKey: TASKS_QK.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: CALENDAR_QK.all });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create task');
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskWritePayload }) =>
      taskService.updateTask(id, data),
    onSuccess: (_, variables) => {
      toast.success('Task updated');
      queryClient.invalidateQueries({ queryKey: TASKS_QK.all });
      queryClient.invalidateQueries({ queryKey: TASKS_QK.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: CALENDAR_QK.all });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update task');
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.completeTask(id),
    onSuccess: () => {
      toast.success('Task marked complete');
      queryClient.invalidateQueries({ queryKey: TASKS_QK.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: CALENDAR_QK.all });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to complete task');
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.deleteTask(id),
    onSuccess: () => {
      toast.success('Task deleted');
      queryClient.invalidateQueries({ queryKey: TASKS_QK.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: CALENDAR_QK.all });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete task');
    },
  });
}
