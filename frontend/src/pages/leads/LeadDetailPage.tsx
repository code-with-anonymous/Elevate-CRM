import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Save,
  Clock,
  CheckSquare,
  FileText,
  Building,
  Mail,
  Phone,
  DollarSign,
  Plus,
  Loader2,
} from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import { useLead, useUpdateLead, useDeleteLead } from '@/hooks/useLeads';
import { useQueryClient } from '@tanstack/react-query';
import axiosInstance from '@/services/api/axiosInstance';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import toast from 'react-hot-toast';

dayjs.extend(relativeTime);

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'timeline' | 'tasks' | 'notes'>('timeline');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [addingTask, setAddingTask] = useState(false);

  // Queries & Mutations
  const { data: leadData, isLoading, isError } = useLead(id || '');
  const updateLeadMutation = useUpdateLead();
  const deleteLeadMutation = useDeleteLead();

  const lead = leadData?.lead || leadData;
  const tasks = leadData?.tasks || [];

  // Form State for Inline Editing
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    source: 'Other',
    status: 'New',
    value: 0,
    notes: '',
  });

  useEffect(() => {
    if (lead) {
      setFormData({
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        company: lead.company || '',
        source: lead.source || 'Other',
        status: lead.status || 'New',
        value: lead.value || 0,
        notes: lead.notes || '',
      });
    }
  }, [lead]);

  // Handle Form Change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'value' ? Number(value) : value,
    }));
  };

  // Save Lead Updates
  const handleSave = () => {
    if (!id) return;
    updateLeadMutation.mutate({ id, data: formData });
  };

  // Delete Lead
  const handleDelete = async () => {
    if (!id) return;
    await deleteLeadMutation.mutateAsync(id);
    navigate('/leads');
  };

  // Quick Add Task for this Lead
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !id) return;
    setAddingTask(true);
    try {
      await axiosInstance.post('/tasks', {
        title: newTaskTitle,
        priority: newTaskPriority,
        relatedTo: id,
        relatedModel: 'Lead',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      });
      toast.success('Task added for lead');
      setNewTaskTitle('');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add task');
    } finally {
      setAddingTask(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="p-8 text-center text-destructive">
        <p className="font-semibold">Lead not found or failed to load.</p>
        <Link to="/leads" className="mt-4 inline-block text-xs font-semibold text-blue-500 underline">
          Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/leads')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <AvatarWithInitials firstName={lead.firstName} lastName={lead.lastName} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">
                {lead.firstName} {lead.lastName}
              </h1>
              <StatusBadge status={formData.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {lead.company || 'No Company'} · Added {dayjs(lead.createdAt).fromNow()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={updateLeadMutation.isPending}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-500 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-600 active:scale-[0.98]"
          >
            {updateLeadMutation.isPending ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </button>

          <button
            onClick={() => setConfirmDelete(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-xs font-semibold text-destructive hover:bg-destructive/20"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left Column: Lead Info Card */}
        <div className="lg:col-span-1 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-3">
            Lead Details
          </h2>

          <div className="space-y-4 text-xs">
            {/* First Name & Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-muted-foreground">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="font-semibold text-muted-foreground">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="font-semibold text-muted-foreground flex items-center gap-1">
                <Mail size={12} /> Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="font-semibold text-muted-foreground flex items-center gap-1">
                <Phone size={12} /> Phone
              </label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
              />
            </div>

            {/* Company */}
            <div>
              <label className="font-semibold text-muted-foreground flex items-center gap-1">
                <Building size={12} /> Company
              </label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
              />
            </div>

            {/* Status & Source */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-muted-foreground">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-semibold outline-none focus:border-blue-500"
                >
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Qualified">Qualified</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Won">Won</option>
                  <option value="Lost">Lost</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Source</label>
                <select
                  name="source"
                  value={formData.source}
                  onChange={handleChange}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-blue-500"
                >
                  <option value="Cold Outreach">Cold Outreach</option>
                  <option value="Event">Event</option>
                  <option value="Social">Social</option>
                  <option value="Website">Website</option>
                  <option value="Referral">Referral</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Deal Value */}
            <div>
              <label className="font-semibold text-muted-foreground flex items-center gap-1">
                <DollarSign size={12} /> Deal Value (USD)
              </label>
              <input
                type="number"
                name="value"
                value={formData.value}
                onChange={handleChange}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Tabs (Timeline | Tasks | Notes) */}
        <div className="lg:col-span-2 flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-border bg-muted/30 px-4">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-1.5 py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
                activeTab === 'timeline'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock size={14} />
              Activity Timeline
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-1.5 py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
                activeTab === 'tasks'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckSquare size={14} />
              Tasks ({tasks.length})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-1.5 py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
                activeTab === 'notes'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText size={14} />
              Notes
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-5 flex-1 overflow-y-auto">
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground">Status History</h3>
                {lead.activityLog && lead.activityLog.length > 0 ? (
                  <div className="relative border-l-2 border-border pl-4 space-y-4 ml-2">
                    {lead.activityLog.map((log: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-card" />
                        <div className="flex items-center justify-between">
                          <StatusBadge status={log.status} />
                          <span className="text-[11px] text-muted-foreground">
                            {dayjs(log.changedAt).format('DD MMM YYYY, hh:mm A')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {log.note || `Status changed to ${log.status}`}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    <p>Current status: <StatusBadge status={lead.status} /></p>
                    <p className="mt-1 text-[11px]">
                      Last updated {dayjs(lead.statusChangedAt || lead.updatedAt).fromNow()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-5">
                {/* Quick Add Task Form */}
                <form onSubmit={handleAddTask} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a new task for this lead..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-blue-500"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-medium outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  <button
                    type="submit"
                    disabled={addingTask}
                    className="flex h-9 items-center gap-1 rounded-lg bg-blue-500 px-3 text-xs font-semibold text-white hover:bg-blue-600"
                  >
                    <Plus size={14} /> Add
                  </button>
                </form>

                {/* Tasks List */}
                <div className="space-y-2">
                  {tasks.length > 0 ? (
                    tasks.map((task: any) => (
                      <div
                        key={task._id || task.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <CheckSquare size={16} className="text-muted-foreground" />
                          <div>
                            <p className="font-semibold text-foreground">{task.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Due: {task.dueDate ? dayjs(task.dueDate).format('DD MMM YYYY') : 'No due date'}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={task.priority} />
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No tasks created for this lead yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <textarea
                  name="notes"
                  rows={6}
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Add internal notes about this lead..."
                  className="w-full rounded-lg border border-border bg-background p-3 text-xs outline-none focus:border-blue-500"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={updateLeadMutation.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-500 px-3 text-xs font-semibold text-white hover:bg-blue-600"
                  >
                    <Save size={12} /> Save Notes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Delete Lead?</h3>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to delete lead <strong className="text-foreground">{lead.firstName} {lead.lastName}</strong>? This action will archive the lead data.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="h-8 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="h-8 rounded-lg bg-destructive px-3 text-xs font-semibold text-white hover:bg-destructive/90"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
