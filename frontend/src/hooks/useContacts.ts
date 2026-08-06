import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactService, Contact, GetContactsParams } from '@/services/api/contactService';
import toast from 'react-hot-toast';

export const CONTACTS_QK = {
  all: ['contacts'] as const,
  list: (params?: GetContactsParams) => [...CONTACTS_QK.all, 'list', params] as const,
  detail: (id: string) => [...CONTACTS_QK.all, 'detail', id] as const,
};

export function useContactsList(params?: GetContactsParams) {
  return useQuery({
    queryKey: CONTACTS_QK.list(params),
    queryFn: () => contactService.getContacts(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: CONTACTS_QK.detail(id),
    queryFn: () => contactService.getContact(id),
    enabled: Boolean(id),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Contact>) => contactService.createContact(data),
    onSuccess: () => {
      toast.success('Contact created successfully');
      queryClient.invalidateQueries({ queryKey: CONTACTS_QK.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create contact');
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      contactService.updateContact(id, data),
    onSuccess: (_, variables) => {
      toast.success('Contact updated successfully');
      queryClient.invalidateQueries({ queryKey: CONTACTS_QK.all });
      queryClient.invalidateQueries({ queryKey: CONTACTS_QK.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update contact');
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contactService.deleteContact(id),
    onSuccess: () => {
      toast.success('Contact deleted');
      queryClient.invalidateQueries({ queryKey: CONTACTS_QK.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete contact');
    },
  });
}
