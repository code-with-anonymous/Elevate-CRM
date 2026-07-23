import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leadsService } from '@/services/api/leadsService';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';

const leadSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').or(z.string().length(0)).nullable().optional(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  source: z.enum(['Cold Outreach', 'Event', 'Social', 'Website', 'Referral', 'Other']),
  value: z.coerce.number().min(0, 'Value must be positive'),
  assignedTo: z.string().optional().nullable(),
  status: z.enum(['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost']),
});

type LeadFormValues = z.infer<typeof leadSchema>;

interface AddLeadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddLeadDrawer({ isOpen, onClose }: AddLeadDrawerProps) {
  const queryClient = useQueryClient();

  // Fetch users for the assignee dropdown
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => leadsService.getOrgUsers(),
    enabled: isOpen,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      company: '',
      source: 'Other',
      value: 0,
      assignedTo: '',
      status: 'New',
    },
  });

  const createLeadMutation = useMutation({
    mutationFn: (values: LeadFormValues) => {
      // Map empty strings to null for optional DB fields
      const payload = {
        ...values,
        email: values.email || null,
        phone: values.phone || null,
        company: values.company || null,
        assignedTo: values.assignedTo || null,
      };
      return leadsService.createLead(payload);
    },
    onSuccess: () => {
      toast.success('Lead added successfully');
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'lead-activity'] });
      reset();
      onClose();
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err?.response?.data?.message || 'Failed to add lead');
    },
  });

  const onSubmit = (data: LeadFormValues) => {
    createLeadMutation.mutate(data);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md border-l border-border bg-card shadow-2xl flex flex-col h-full"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Add New Lead</h2>
                <p className="text-xs text-muted-foreground">Fill in the pipeline details</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">First Name</label>
                  <input
                    type="text"
                    {...register('firstName')}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-2xs text-red-500">{errors.firstName.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Last Name</label>
                  <input
                    type="text"
                    {...register('lastName')}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-2xs text-red-500">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                />
                {errors.email && (
                  <p className="mt-1 text-2xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Phone</label>
                <input
                  type="text"
                  {...register('phone')}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Company</label>
                <input
                  type="text"
                  {...register('company')}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Lead Source</label>
                  <select
                    {...register('source')}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    <option value="Cold Outreach">Cold Outreach</option>
                    <option value="Event">Event</option>
                    <option value="Social">Social</option>
                    <option value="Website">Website</option>
                    <option value="Referral">Referral</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Lead Status</label>
                  <select
                    {...register('status')}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Proposal">Proposal</option>
                    <option value="Won">Won</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Value (USD)</label>
                  <input
                    type="number"
                    {...register('value')}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  />
                  {errors.value && (
                    <p className="mt-1 text-2xs text-red-500">{errors.value.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Assigned To</label>
                  <select
                    {...register('assignedTo')}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-border pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLeadMutation.isPending}
                  className="flex-1 h-10 rounded-lg bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 flex items-center justify-center gap-1.5"
                >
                  {createLeadMutation.isPending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Add Lead'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
