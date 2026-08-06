import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import DataTable, { Column } from '@/components/common/DataTable';
import FilterBar from '@/components/common/FilterBar';
import StatusBadge from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import AddLeadDrawer from '@/components/leads/AddLeadDrawer';
import { useLeadsList, useDeleteLead, useUpdateLeadStatus } from '@/hooks/useLeads';
import dayjs from 'dayjs';

export default function LeadsPage() {
  const navigate = useNavigate();

  // Filter & Pagination States
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // UI Drawer & Selection States
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Queries & Mutations
  const { data, isLoading } = useLeadsList({
    page,
    limit: 15,
    search,
    status: statusFilter,
    source: sourceFilter,
    sortBy,
    sortOrder,
  });

  const deleteLeadMutation = useDeleteLead();
  const updateStatusMutation = useUpdateLeadStatus();

  const leads = data?.leads || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Sorting Handler
  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
  };

  // Bulk Selection Handlers
  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedIds(leads.map((l: any) => l.id || l._id));
    } else {
      setSelectedIds([]);
    }
  };

  // Bulk Actions
  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} lead(s)?`)) return;
    for (const id of selectedIds) {
      await deleteLeadMutation.mutateAsync(id);
    }
    setSelectedIds([]);
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    for (const id of selectedIds) {
      await updateStatusMutation.mutateAsync({ id, status: newStatus });
    }
    setSelectedIds([]);
  };

  // Table Columns Definition
  const columns: Column<any>[] = [
    {
      key: 'fullName',
      header: 'NAME',
      sortable: true,
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <AvatarWithInitials
            firstName={row.firstName}
            lastName={row.lastName}
            avatarUrl={row.assignedTo?.avatarUrl}
            size="md"
          />
          <div>
            <p className="font-semibold text-foreground">
              {row.firstName} {row.lastName}
            </p>
            <p className="text-[11px] text-muted-foreground">{row.email || 'No email'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'COMPANY',
      sortable: true,
      accessor: (row) => <span className="font-medium text-foreground">{row.company || '—'}</span>,
    },
    {
      key: 'status',
      header: 'STATUS',
      sortable: true,
      accessor: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'source',
      header: 'SOURCE',
      sortable: true,
      accessor: (row) => (
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {row.source}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'VALUE',
      sortable: true,
      align: 'right',
      accessor: (row) => (
        <span className="font-semibold text-foreground">
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          }).format(row.value || 0)}
        </span>
      ),
    },
    {
      key: 'assignedTo',
      header: 'ASSIGNED TO',
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.assignedTo ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}` : 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'CREATED',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {dayjs(row.createdAt).format('DD MMM YYYY')}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-6 h-full min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
              {total}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage, track, and convert prospective leads across your pipeline.
          </p>
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-600 active:scale-[0.98]"
        >
          <Plus size={16} />
          Add New Lead
        </button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchPlaceholder="Search leads by name, email, company..."
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
              { label: 'New', value: 'New' },
              { label: 'Contacted', value: 'Contacted' },
              { label: 'Qualified', value: 'Qualified' },
              { label: 'Proposal', value: 'Proposal' },
              { label: 'Won', value: 'Won' },
              { label: 'Lost', value: 'Lost' },
            ],
          },
          {
            key: 'source',
            label: 'Source',
            value: sourceFilter,
            onChange: (v) => {
              setSourceFilter(v);
              setPage(1);
            },
            options: [
              { label: 'Cold Outreach', value: 'Cold Outreach' },
              { label: 'Event', value: 'Event' },
              { label: 'Social', value: 'Social' },
              { label: 'Website', value: 'Website' },
              { label: 'Referral', value: 'Referral' },
              { label: 'Other', value: 'Other' },
            ],
          },
        ]}
      />

      {/* Bulk Action Bar (when rows are selected) */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/40">
          <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">
            {selectedIds.length} lead(s) selected
          </span>
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => {
                if (e.target.value) handleBulkStatusChange(e.target.value);
              }}
              defaultValue=""
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium outline-none"
            >
              <option value="" disabled>
                Change status to...
              </option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Proposal">Proposal</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>

            <button
              onClick={handleBulkDelete}
              className="flex h-8 items-center gap-1 rounded-lg bg-destructive/10 px-3 text-xs font-semibold text-destructive hover:bg-destructive/20"
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Main Data Table */}
      <DataTable
        columns={columns}
        data={leads}
        isLoading={isLoading}
        selectable
        selectedIds={selectedIds}
        onSelectRow={handleSelectRow}
        onSelectAll={handleSelectAll}
        onRowClick={(row) => navigate(`/leads/${row.id || row._id}`)}
        sortColumn={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        pagination={{
          page,
          limit: 15,
          total,
          totalPages,
          onPageChange: (p) => setPage(p),
        }}
        emptyMessage="No leads found. Create your first lead to start filling your pipeline!"
      />

      {/* Add Lead Drawer */}
      <AddLeadDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
