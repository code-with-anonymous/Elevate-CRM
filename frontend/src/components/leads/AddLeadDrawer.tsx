// ─────────────────────────────────────────────────────────────────────────────
// src/components/leads/AddLeadDrawer.tsx
// Visual pass only — the zod schema, react-hook-form wiring, the create
// mutation and its exact invalidation keys are untouched.
// Motion moved off a spring onto the shared drawer easing, so it settles
// precisely instead of overshooting.
// ─────────────────────────────────────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leadsService } from '@/services/api/leadsService';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, controlClass, errorControlClass, selectClass } from '@/components/ui/field';
import { drawerVariants, overlayVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

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

const SOURCES = ['Cold Outreach', 'Event', 'Social', 'Website', 'Referral', 'Other'];
const STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];

export default function AddLeadDrawer({ isOpen, onClose }: AddLeadDrawerProps) {
  const queryClient = useQueryClient();

  // Fetch users for the assignee dropdown
  const { data: users = [] } = useQuery({
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
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-[2px]"
          />

          <motion.div
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Add new lead"
            className="fixed bottom-0 right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border/60 bg-card shadow-pop"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-6 py-5">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Add new lead
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Fill in the pipeline details
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" htmlFor="firstName" required error={errors.firstName?.message}>
                    <input
                      id="firstName"
                      type="text"
                      {...register('firstName')}
                      className={cn(controlClass, errors.firstName && errorControlClass)}
                    />
                  </Field>

                  <Field label="Last name" htmlFor="lastName" required error={errors.lastName?.message}>
                    <input
                      id="lastName"
                      type="text"
                      {...register('lastName')}
                      className={cn(controlClass, errors.lastName && errorControlClass)}
                    />
                  </Field>
                </div>

                <Field label="Email" htmlFor="email" error={errors.email?.message}>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    {...register('email')}
                    className={cn(controlClass, errors.email && errorControlClass)}
                  />
                </Field>

                <Field label="Phone" htmlFor="phone">
                  <input
                    id="phone"
                    type="text"
                    {...register('phone')}
                    className={controlClass}
                  />
                </Field>

                <Field label="Company" htmlFor="company">
                  <input
                    id="company"
                    type="text"
                    {...register('company')}
                    className={controlClass}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Lead source" htmlFor="source">
                    <select id="source" {...register('source')} className={selectClass}>
                      {SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Lead status" htmlFor="status">
                    <select id="status" {...register('status')} className={selectClass}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Value (USD)" htmlFor="value" error={errors.value?.message}>
                    <input
                      id="value"
                      type="number"
                      {...register('value')}
                      className={cn(
                        controlClass,
                        'tabular-nums',
                        errors.value && errorControlClass
                      )}
                    />
                  </Field>

                  <Field label="Assigned to" htmlFor="assignedTo">
                    <select id="assignedTo" {...register('assignedTo')} className={selectClass}>
                      <option value="">Unassigned</option>
                      {users.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Footer stays docked so the primary action is always reachable */}
              <div className="flex gap-2 border-t border-border/60 px-6 py-4">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  isLoading={createLeadMutation.isPending}
                >
                  Add lead
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
