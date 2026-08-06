import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Trash2, X, Loader2 } from 'lucide-react';
import DataTable, { Column } from '@/components/common/DataTable';
import FilterBar from '@/components/common/FilterBar';
import StatusBadge from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import { useContactsList, useCreateContact, useDeleteContact } from '@/hooks/useContacts';
import { Contact } from '@/services/api/contactService';

export default function ContactsPage() {
  // Filters & Pagination state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Queries & Mutations
  const { data, isLoading } = useContactsList({
    page,
    limit: 15,
    search,
    status: statusFilter,
  });

  const createContactMutation = useCreateContact();
  const deleteContactMutation = useDeleteContact();

  const contacts = data?.contacts || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 15) || 1;

  // New Contact form state
  const [newContactData, setNewContactData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    jobTitle: '',
    status: 'active' as const,
    notes: '',
    tags: '',
  });

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedIds(contacts.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} contact(s)?`)) return;
    for (const id of selectedIds) {
      await deleteContactMutation.mutateAsync(id);
    }
    setSelectedIds([]);
  };

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactData.firstName.trim()) return;

    const tagsArray = newContactData.tags
      ? newContactData.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    createContactMutation.mutate(
      {
        ...newContactData,
        tags: tagsArray,
      },
      {
        onSuccess: () => {
          setIsAddModalOpen(false);
          setNewContactData({
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            company: '',
            jobTitle: '',
            status: 'active',
            notes: '',
            tags: '',
          });
        },
      }
    );
  };

  const columns: Column<Contact>[] = [
    {
      key: 'fullName',
      header: 'NAME',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <AvatarWithInitials
            firstName={row.firstName}
            lastName={row.lastName}
            avatarUrl={row.avatarUrl}
            size="md"
          />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">
                {row.firstName} {row.lastName}
              </p>
              {(row.leadId || row.dealId) && (
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                  Lead Converted
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{row.email || 'No email'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'COMPANY',
      accessor: (row) => (
        <span className="font-medium text-foreground">{row.company || '—'}</span>
      ),
    },
    {
      key: 'jobTitle',
      header: 'JOB TITLE',
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">{row.jobTitle || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'PHONE',
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">{row.phone || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'STATUS',
      accessor: (row) => (
        <StatusBadge
          status={row.status === 'active' ? 'Active' : row.status === 'inactive' ? 'Inactive' : 'Churned'}
          variantMap={{
            Active: { dotClass: 'bg-green-500', badgeClass: 'bg-green-500/10 text-green-600' },
            Inactive: { dotClass: 'bg-gray-400', badgeClass: 'bg-gray-500/10 text-gray-500' },
            Churned: { dotClass: 'bg-red-500', badgeClass: 'bg-red-500/10 text-red-600' },
          }}
        />
      ),
    },
    {
      key: 'tags',
      header: 'TAGS',
      accessor: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.tags && row.tags.length > 0 ? (
            row.tags.map((tag, idx) => (
              <span
                key={idx}
                className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>Contacts — ElevateCRM</title>
        <meta name="description" content="View and manage key contacts and converted leads." />
      </Helmet>

      <div className="flex flex-col gap-5 p-6 min-h-[calc(100vh-3.5rem)] bg-background">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Contacts</h1>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                {total}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Converted leads and verified organization contacts.
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-600 active:scale-[0.98]"
          >
            <Plus size={16} />
            Add Contact
          </button>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchPlaceholder="Search contacts by name, email, company..."
          searchValue={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: (v) => {
                setStatusFilter(v);
                setPage(1);
              },
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
                { label: 'Churned', value: 'churned' },
              ],
            },
          ]}
        />

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/40">
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">
              {selectedIds.length} contact(s) selected
            </span>
            <button
              onClick={handleBulkDelete}
              className="flex h-8 items-center gap-1 rounded-lg bg-destructive/10 px-3 text-xs font-semibold text-destructive hover:bg-destructive/20"
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
        )}

        {/* Table */}
        <DataTable
          columns={columns}
          data={contacts}
          isLoading={isLoading}
          selectable
          selectedIds={selectedIds}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          pagination={{
            page,
            limit: 15,
            total,
            totalPages,
            onPageChange: (p) => setPage(p),
          }}
          emptyMessage="No contacts found. Won leads will automatically convert into contacts here."
        />
      </div>

      {/* Add Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-foreground">Add New Contact</h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">First Name *</label>
                  <input
                    type="text"
                    required
                    value={newContactData.firstName}
                    onChange={(e) =>
                      setNewContactData({ ...newContactData, firstName: e.target.value })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-muted-foreground">Last Name</label>
                  <input
                    type="text"
                    value={newContactData.lastName}
                    onChange={(e) =>
                      setNewContactData({ ...newContactData, lastName: e.target.value })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={newContactData.email}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, email: e.target.value })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">Phone</label>
                  <input
                    type="text"
                    value={newContactData.phone}
                    onChange={(e) =>
                      setNewContactData({ ...newContactData, phone: e.target.value })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-muted-foreground">Company</label>
                  <input
                    type="text"
                    value={newContactData.company}
                    onChange={(e) =>
                      setNewContactData({ ...newContactData, company: e.target.value })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Job Title</label>
                <input
                  type="text"
                  value={newContactData.jobTitle}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, jobTitle: e.target.value })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="VIP, Key Account, Partner"
                  value={newContactData.tags}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, tags: e.target.value })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-8 rounded-lg border border-border px-3 font-semibold text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createContactMutation.isPending}
                  className="flex h-8 items-center gap-1 rounded-lg bg-blue-500 px-4 font-semibold text-white hover:bg-blue-600"
                >
                  {createContactMutation.isPending ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    'Save Contact'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
