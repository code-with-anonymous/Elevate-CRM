// ─────────────────────────────────────────────────────────────────────────────
// src/pages/leads/LeadsPage.tsx
// Record table. Query state, sorting, selection and every mutation are exactly
// as before — this is presentation only.
//
// Layout notes
//  · Identity is one column, Attio-style: avatar, name, company beneath.
//  · Value is right-aligned tabular-nums and gains weight with deal size, so
//    the big numbers surface without a chart.
//  · Add Lead lives in the toolbar rather than a separate header row.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowUpRight, Plus, Trash2, Users, X } from 'lucide-react';
import dayjs from 'dayjs';
import DataTable, { Column, RowAction } from '@/components/common/DataTable';
import FilterBar from '@/components/common/FilterBar';
import StatusBadge from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import PageHeader from '@/components/common/PageHeader';
import AddLeadDrawer from '@/components/leads/AddLeadDrawer';
import { Button } from '@/components/ui/button';
import { selectClass } from '@/components/ui/field';
import { useDeleteLead, useLeadsList, useUpdateLeadStatus } from '@/hooks/useLeads';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT, pageVariants } from '@/lib/motion';

const STATUS_OPTIONS = [
  { label: 'New', value: 'New' },
  { label: 'Contacted', value: 'Contacted' },
  { label: 'Qualified', value: 'Qualified' },
  { label: 'Proposal', value: 'Proposal' },
  { label: 'Won', value: 'Won' },
  { label: 'Lost', value: 'Lost' },
];

const SOURCE_OPTIONS = [
  { label: 'Cold Outreach', value: 'Cold Outreach' },
  { label: 'Event', value: 'Event' },
  { label: 'Social', value: 'Social' },
  { label: 'Website', value: 'Website' },
  { label: 'Referral', value: 'Referral' },
  { label: 'Other', value: 'Other' },
];

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

  const handleDeleteOne = (row: any) => {
    const name = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || 'this lead';
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    deleteLeadMutation.mutate(row.id || row._id);
  };

  // Deal weight is relative to the biggest number on screen, so "large" means
  // large *for this page* rather than against an arbitrary constant.
  const maxValue = Math.max(1, ...leads.map((l: any) => Number(l.value) || 0));

  const columns: Column<any>[] = [
    {
      key: 'fullName',
      header: 'Name',
      sortable: true,
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <AvatarWithInitials
            firstName={row.firstName}
            lastName={row.lastName}
            avatarUrl={row.assignedTo?.avatarUrl}
            size="md"
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">
              {row.firstName} {row.lastName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.company || 'No company'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      hideOnMobile: true,
      accessor: (row) => (
        <span className="text-[13px] text-muted-foreground">{row.email || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      accessor: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      hideOnMobile: true,
      accessor: (row) => (
        <span className="text-[13px] text-muted-foreground">{row.source || '—'}</span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      sortable: true,
      align: 'right',
      accessor: (row) => {
        const value = Number(row.value) || 0;
        const ratio = value / maxValue;
        return (
          <span
            className={cn(
              'text-[13px] tabular-nums',
              ratio >= 0.66
                ? 'font-semibold text-foreground'
                : ratio >= 0.33
                ? 'font-medium text-foreground'
                : 'font-normal text-muted-foreground'
            )}
          >
            {formatCurrency(value)}
          </span>
        );
      },
    },
    {
      key: 'assignedTo',
      header: 'Owner',
      hideOnMobile: true,
      accessor: (row) =>
        row.assignedTo ? (
          <div className="flex items-center gap-2">
            <AvatarWithInitials
              firstName={row.assignedTo.firstName}
              lastName={row.assignedTo.lastName}
              avatarUrl={row.assignedTo.avatarUrl}
              size="xs"
            />
            <span className="text-[13px] text-muted-foreground">
              {row.assignedTo.firstName} {row.assignedTo.lastName}
            </span>
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      hideOnMobile: true,
      accessor: (row) => (
        <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">
          {dayjs(row.createdAt).format('DD MMM YYYY')}
        </span>
      ),
    },
  ];

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto flex h-full min-h-[calc(100vh-7.5rem)] max-w-[1600px] flex-col"
    >
      <Helmet>
        <title>Leads | ElevateCRM</title>
      </Helmet>

      <PageHeader
        title="Leads"
        count={total}
        description="Manage, track, and convert prospects across your pipeline."
        className="mb-8"
      />

      <FilterBar
        searchPlaceholder="Search by name, email, or company…"
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
            options: STATUS_OPTIONS,
          },
          {
            key: 'source',
            label: 'Source',
            value: sourceFilter,
            onChange: (v) => {
              setSourceFilter(v);
              setPage(1);
            },
            options: SOURCE_OPTIONS,
          },
        ]}
        actions={
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus size={15} />
            Add Lead
          </Button>
        }
      />

      {/* Bulk bar — slides in only while a selection exists */}
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2"
        >
          <span className="text-xs font-medium tabular-nums text-foreground">
            {selectedIds.length} selected
          </span>

          <div className="flex items-center gap-2">
            <select
              onChange={(e) => {
                if (e.target.value) handleBulkStatusChange(e.target.value);
              }}
              defaultValue=""
              aria-label="Change status for selected leads"
              className={cn(selectClass, 'h-8 w-auto text-xs')}
            >
              <option value="" disabled>
                Change status…
              </option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 size={13} />
              Delete
            </Button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              aria-label="Clear selection"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}

      <div className="mt-4 flex flex-1 flex-col">
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
          rowActions={(row) => (
            <>
              <RowAction
                icon={<ArrowUpRight size={14} />}
                label="Open lead"
                onClick={() => navigate(`/leads/${row.id || row._id}`)}
              />
              <RowAction
                icon={<Trash2 size={14} />}
                label="Delete lead"
                tone="destructive"
                onClick={() => handleDeleteOne(row)}
              />
            </>
          )}
          emptyIcon={<Users size={22} />}
          emptyTitle={
            search || statusFilter || sourceFilter ? 'No matching leads' : 'No leads yet'
          }
          emptyMessage={
            search || statusFilter || sourceFilter
              ? 'Try loosening your filters — nothing matches this combination right now.'
              : 'Add your first lead and it will start filling the pipeline immediately.'
          }
          emptyAction={
            search || statusFilter || sourceFilter ? undefined : (
              <Button onClick={() => setDrawerOpen(true)}>
                <Plus size={15} />
                Add your first lead
              </Button>
            )
          }
        />
      </div>

      <AddLeadDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </motion.div>
  );
}
