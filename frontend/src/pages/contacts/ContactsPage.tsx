// ─────────────────────────────────────────────────────────────────────────────
// src/pages/contacts/ContactsPage.tsx
// Most of this page's polish arrives free from the shared DataTable/FilterBar
// redesign. What's specific to Contacts:
//   · "Converted" indicator as an iconed badge rather than loose text
//   · tags as muted chips that collapse past three
//   · a Table | Grid switch — grid is purely a presentation toggle over the
//     same page of data, so pagination and filters behave identically
//
// useContactsList / useCreateContact / useDeleteContact and their payload
// shapes are untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AnimatePresence, motion } from 'framer-motion';
import { Contact2, LayoutGrid, List, Plus, Sparkles, Trash2, X } from 'lucide-react';
import DataTable, { Column, RowAction } from '@/components/common/DataTable';
import FilterBar from '@/components/common/FilterBar';
import StatusBadge from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import PageHeader from '@/components/common/PageHeader';
import Pagination from '@/components/common/Pagination';
import { TagList } from '@/components/common/TagChip';
import SegmentedControl from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { Field, controlClass } from '@/components/ui/field';
import { useContactsList, useCreateContact, useDeleteContact } from '@/hooks/useContacts';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { Contact } from '@/services/api/contactService';
import { cn } from '@/lib/cn';
import {
  DURATION,
  EASE_OUT,
  overlayVariants,
  pageVariants,
  staggerContainer,
  staggerItem,
} from '@/lib/motion';

type ViewMode = 'table' | 'grid';

const VIEW_SEGMENTS = [
  { value: 'table' as const, label: 'Table', icon: <List size={14} /> },
  { value: 'grid' as const, label: 'Grid', icon: <LayoutGrid size={14} /> },
];

const STATUS_LABEL: Record<Contact['status'], string> = {
  active: 'Active',
  inactive: 'Inactive',
  churned: 'Churned',
};

// ── Converted-from-lead indicator ─────────────────────────────────────────────

function ConvertedBadge({ className }: { className?: string }) {
  return (
    <span
      title="Converted from a lead"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-status-accent/10 px-1.5 py-0.5',
        'text-[10px] font-medium text-status-accent ring-1 ring-inset ring-status-accent/20',
        className
      )}
    >
      <Sparkles size={9} />
      Converted
    </span>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

function ContactCard({
  contact,
  selected,
  onToggleSelect,
  onDelete,
}: {
  contact: Contact;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (contact: Contact) => void;
}) {
  const converted = Boolean(contact.leadId || contact.dealId);
  // DELETE /api/contacts/:id is manager+. Both controls in the hover chrome
  // serve deletion — the checkbox only feeds the bulk-delete bar — so the whole
  // strip is omitted rather than left there to answer 403.
  const { can } = usePermissions();
  const canDelete = can(PERMISSIONS.CONTACTS_DELETE);

  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        'group relative flex flex-col items-center rounded-xl border p-4 text-center sm:p-5',
        'transition-[border-color,box-shadow] duration-150 ease-out',
        selected
          ? 'border-primary/40 bg-primary/[0.04]'
          : 'border-border/60 bg-card hover:border-border hover:shadow-sm'
      )}
    >
      {/* Hover chrome — select + delete */}
      {canDelete && (
        <div className="row-actions absolute inset-x-2 top-2 flex items-center justify-between">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(contact.id)}
            aria-label={`Select ${contact.firstName} ${contact.lastName}`}
            className="h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-border bg-background transition-colors duration-150 checked:border-primary checked:bg-primary hover:border-primary/60"
          />
          <button
            type="button"
            onClick={() => onDelete(contact)}
            aria-label="Delete contact"
            title="Delete contact"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      <AvatarWithInitials
        firstName={contact.firstName}
        lastName={contact.lastName}
        avatarUrl={contact.avatarUrl}
        size="xl"
      />

      <p className="mt-3 w-full truncate text-[13px] font-medium text-foreground">
        {contact.firstName} {contact.lastName}
      </p>
      <p className="w-full truncate text-[11px] text-muted-foreground">
        {contact.jobTitle || contact.email || '—'}
      </p>
      {contact.company && (
        <p className="mt-0.5 w-full truncate text-[11px] font-medium text-foreground">
          {contact.company}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
        <StatusBadge status={STATUS_LABEL[contact.status]} size="sm" />
        {converted && <ConvertedBadge />}
      </div>

      {contact.tags && contact.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap justify-center">
          <TagList tags={contact.tags} max={2} className="justify-center" />
        </div>
      )}
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  // Filters & Pagination state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('table');

  // Queries & Mutations
  const { data, isLoading } = useContactsList({
    page,
    limit: 15,
    search,
    status: statusFilter,
  });

  const createContactMutation = useCreateContact();
  const deleteContactMutation = useDeleteContact();

  // Mirrors contacts.routes.js — write is member+, delete is manager+.
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.CONTACTS_WRITE);
  const canDelete = can(PERMISSIONS.CONTACTS_DELETE);

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

  const handleDeleteOne = (contact: Contact) => {
    const name = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'this contact';
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    deleteContactMutation.mutate(contact.id);
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

  const isFiltered = Boolean(search || statusFilter);

  const columns: Column<Contact>[] = [
    {
      key: 'fullName',
      header: 'Name',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <AvatarWithInitials
            firstName={row.firstName}
            lastName={row.lastName}
            avatarUrl={row.avatarUrl}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[13px] font-medium text-foreground">
                {row.firstName} {row.lastName}
              </p>
              {(row.leadId || row.dealId) && <ConvertedBadge />}
            </div>
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
      key: 'jobTitle',
      header: 'Job title',
      hideOnMobile: true,
      accessor: (row) => (
        <span className="text-[13px] text-muted-foreground">{row.jobTitle || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      hideOnMobile: true,
      accessor: (row) => (
        <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">
          {row.phone || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => <StatusBadge status={STATUS_LABEL[row.status]} size="sm" />,
    },
    {
      key: 'tags',
      header: 'Tags',
      hideOnMobile: true,
      accessor: (row) => <TagList tags={row.tags} />,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Contacts — ElevateCRM</title>
        <meta
          name="description"
          content="View and manage key contacts and converted leads."
        />
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-[1600px] flex-col"
      >
        <PageHeader
          title="Contacts"
          count={total}
          description="Converted leads and verified organization contacts."
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
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
                { label: 'Churned', value: 'churned' },
              ],
            },
          ]}
          actions={
            <>
              <SegmentedControl
                segments={VIEW_SEGMENTS}
                value={view}
                onChange={setView}
                layoutId="contacts-view"
                size="md"
                iconOnly
                aria-label="View mode"
              />
              {canWrite && (
                <Button onClick={() => setIsAddModalOpen(true)}>
                  <Plus size={15} />
                  <span className="hidden sm:inline">Add Contact</span>
                </Button>
              )}
            </>
          }
        />

        {/* Bulk bar */}
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
              {canDelete && (
                <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                  <Trash2 size={13} />
                  Delete
                </Button>
              )}
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
          {view === 'table' ? (
            <DataTable
              columns={columns}
              data={contacts}
              isLoading={isLoading}
              selectable={canDelete}
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
              rowActions={
                canDelete
                  ? (row: Contact) => (
                      <RowAction
                        icon={<Trash2 size={14} />}
                        label="Delete contact"
                        tone="destructive"
                        onClick={() => handleDeleteOne(row)}
                      />
                    )
                  : undefined
              }
              emptyIcon={<Contact2 size={22} />}
              emptyTitle={isFiltered ? 'No matching contacts' : 'No contacts yet'}
              emptyMessage={
                isFiltered
                  ? 'Try loosening your filters — nothing matches this combination right now.'
                  : canWrite
                    ? 'Won leads convert into contacts automatically, or you can add one directly.'
                    : 'Won leads convert into contacts automatically. Your role can view contacts but not add them.'
              }
              emptyAction={
                isFiltered || !canWrite ? undefined : (
                  <Button onClick={() => setIsAddModalOpen(true)}>
                    <Plus size={15} />
                    Add a contact
                  </Button>
                )
              }
            />
          ) : (
            <GridView
              contacts={contacts}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onToggleSelect={handleSelectRow}
              onDelete={handleDeleteOne}
              isFiltered={isFiltered}
              onAdd={() => setIsAddModalOpen(true)}
              page={page}
              limit={15}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      </motion.div>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: DURATION.normal, ease: EASE_OUT }}
              role="dialog"
              aria-modal="true"
              aria-label="Add new contact"
              className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border/60 bg-card shadow-pop"
            >
              <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Add new contact
                </h2>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={handleCreateContact}
                className="flex flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" htmlFor="c-first" required>
                      <input
                        id="c-first"
                        type="text"
                        required
                        value={newContactData.firstName}
                        onChange={(e) =>
                          setNewContactData({ ...newContactData, firstName: e.target.value })
                        }
                        className={controlClass}
                      />
                    </Field>
                    <Field label="Last name" htmlFor="c-last">
                      <input
                        id="c-last"
                        type="text"
                        value={newContactData.lastName}
                        onChange={(e) =>
                          setNewContactData({ ...newContactData, lastName: e.target.value })
                        }
                        className={controlClass}
                      />
                    </Field>
                  </div>

                  <Field label="Email" htmlFor="c-email">
                    <input
                      id="c-email"
                      type="email"
                      placeholder="name@company.com"
                      value={newContactData.email}
                      onChange={(e) =>
                        setNewContactData({ ...newContactData, email: e.target.value })
                      }
                      className={controlClass}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone" htmlFor="c-phone">
                      <input
                        id="c-phone"
                        type="text"
                        value={newContactData.phone}
                        onChange={(e) =>
                          setNewContactData({ ...newContactData, phone: e.target.value })
                        }
                        className={controlClass}
                      />
                    </Field>
                    <Field label="Company" htmlFor="c-company">
                      <input
                        id="c-company"
                        type="text"
                        value={newContactData.company}
                        onChange={(e) =>
                          setNewContactData({ ...newContactData, company: e.target.value })
                        }
                        className={controlClass}
                      />
                    </Field>
                  </div>

                  <Field label="Job title" htmlFor="c-title">
                    <input
                      id="c-title"
                      type="text"
                      value={newContactData.jobTitle}
                      onChange={(e) =>
                        setNewContactData({ ...newContactData, jobTitle: e.target.value })
                      }
                      className={controlClass}
                    />
                  </Field>

                  <Field
                    label="Tags"
                    htmlFor="c-tags"
                    hint="Separate with commas — VIP, Key Account, Partner"
                  >
                    <input
                      id="c-tags"
                      type="text"
                      placeholder="VIP, Key Account"
                      value={newContactData.tags}
                      onChange={(e) =>
                        setNewContactData({ ...newContactData, tags: e.target.value })
                      }
                      className={controlClass}
                    />
                  </Field>
                </div>

                <div className="flex gap-2 border-t border-border/60 px-6 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    isLoading={createContactMutation.isPending}
                  >
                    Save contact
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Grid view ─────────────────────────────────────────────────────────────────

interface GridViewProps {
  contacts: Contact[];
  isLoading: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onDelete: (contact: Contact) => void;
  isFiltered: boolean;
  onAdd: () => void;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function GridView({
  contacts,
  isLoading,
  selectedIds,
  onToggleSelect,
  onDelete,
  isFiltered,
  onAdd,
  page,
  limit,
  total,
  totalPages,
  onPageChange,
}: GridViewProps) {
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.CONTACTS_WRITE);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-xl border border-border/60 bg-card p-5"
          >
            <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
            <div className="mt-3 h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-2.5 w-16 animate-pulse rounded bg-muted/60" />
            <div className="mt-3 h-5 w-16 animate-pulse rounded-full bg-muted/60" />
          </div>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-border/60 bg-card px-6 py-20 text-center">
        <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
          <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-primary/5 blur-lg" />
          <Contact2 size={22} className="relative" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-foreground">
          {isFiltered ? 'No matching contacts' : 'No contacts yet'}
        </p>
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {isFiltered
            ? 'Try loosening your filters — nothing matches this combination right now.'
            : canWrite
              ? 'Won leads convert into contacts automatically, or you can add one directly.'
              : 'Won leads convert into contacts automatically. Your role can view contacts but not add them.'}
        </p>
        {!isFiltered && canWrite && (
          <Button className="mt-5" onClick={onAdd}>
            <Plus size={15} />
            Add a contact
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        key={page}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {contacts.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            selected={selectedIds.includes(contact.id)}
            onToggleSelect={onToggleSelect}
            onDelete={onDelete}
          />
        ))}
      </motion.div>

      {/* Exactly the table's pager — same component, not a lookalike */}
      <Pagination
        page={page}
        limit={limit}
        total={total}
        totalPages={totalPages}
        onPageChange={onPageChange}
        className="mt-6 border-t border-border/60 pt-4"
      />
    </div>
  );
}
