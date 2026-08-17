// ─────────────────────────────────────────────────────────────────────────────
// pages/tasks/TasksPage.tsx
// List view + Board view (drag-and-drop kanban) for tasks
// URL param: ?filter=upcoming  → pre-selects "Open" status column
//
// VISUAL PASS. useTasksList / useCreateTask / useUpdateTask / useCompleteTask /
// useDeleteTask and useTaskDrag are untouched, as is every mutation payload and
// the complete/incomplete branch.
//
// Board columns deliberately mirror the Pipeline board — same 2px stage rule,
// same count chip, same wash — so the app has one kanban language, not two.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckSquare,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import DataTable, { Column, RowAction } from '@/components/common/DataTable';
import FilterBar from '@/components/common/FilterBar';
import StatusBadge, { TONE_DOT, toneForStatus } from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import PageHeader from '@/components/common/PageHeader';
import TaskCheckbox from '@/components/common/TaskCheckbox';
import SegmentedControl from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { Field, controlClass, selectClass } from '@/components/ui/field';
import {
  useTasksList,
  useCreateTask,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
} from '@/hooks/useTasks';
import { useTaskDrag } from '@/hooks/useTaskDrag';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { TaskItem } from '@/services/api/taskService';
import { formatRelativeDate, isOverdue } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  DURATION,
  EASE_OUT,
  overlayVariants,
  pageVariants,
  staggerContainer,
  staggerItem,
} from '@/lib/motion';

// ── Board Column types ─────────────────────────────────────────────────────────

type TaskStatus = 'Open' | 'In Progress' | 'Done';

interface BoardColumnConfig {
  key: TaskStatus;
  title: string;
  rule: string;
  wash: string;
}

const BOARD_COLUMNS: BoardColumnConfig[] = [
  { key: 'Open', title: 'To Do', rule: 'bg-status-info', wash: 'bg-status-info/[0.03]' },
  {
    key: 'In Progress',
    title: 'In Progress',
    rule: 'bg-status-warn',
    wash: 'bg-status-warn/[0.03]',
  },
  {
    key: 'Done',
    title: 'Completed',
    rule: 'bg-status-positive',
    wash: 'bg-status-positive/[0.03]',
  },
];

const VIEW_SEGMENTS = [
  { value: 'list' as const, label: 'List', icon: <List size={14} /> },
  { value: 'board' as const, label: 'Board', icon: <LayoutGrid size={14} /> },
];

const STATUS_OPTIONS: TaskStatus[] = ['Open', 'In Progress', 'Done'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'] as const;

// ── Priority — dot + label, not a badge ───────────────────────────────────────
// Priority is a secondary attribute; a filled pill gives it more weight than
// the task title, which is backwards.

function PriorityTag({ priority }: { priority: string }) {
  if (!priority) return <span className="text-[13px] text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[toneForStatus(priority)])} />
      {priority}
    </span>
  );
}

// ── Due date — relative language, overdue tinted ──────────────────────────────

function DueDate({ dueDate, status }: { dueDate?: string | null; status?: string }) {
  if (!dueDate) return <span className="text-[13px] text-muted-foreground">—</span>;
  const overdue = status !== 'Done' && isOverdue(dueDate);
  return (
    <span
      className={cn(
        'whitespace-nowrap text-[13px] tabular-nums',
        overdue ? 'font-medium text-status-negative' : 'text-muted-foreground'
      )}
    >
      {formatRelativeDate(dueDate)}
    </span>
  );
}

// ── Draggable Task Card (board view) ──────────────────────────────────────────

interface TaskCardProps {
  task: TaskItem;
  isDragging?: boolean;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onComplete: (task: TaskItem, e: React.MouseEvent) => void;
}

function TaskCard({ task, isDragging = false, onStatusChange, onComplete }: TaskCardProps) {
  const taskId = task.id || task._id || '';
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: taskId });
  // Read straight from the store rather than threading a prop down through
  // BoardColumn — it's a selector, not a fetch.
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const done = task.status === 'Done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-xl border bg-card p-3',
        'transition-[border-color,box-shadow,transform] duration-150 ease-out',
        isDragging
          ? 'scale-[1.02] border-primary/40 shadow-lg'
          : 'border-border/60 hover:border-border hover:shadow-sm'
      )}
    >
      <div className="flex items-start gap-2.5">
        <TaskCheckbox
          checked={done}
          onToggle={(e) => onComplete(task, e)}
          size="sm"
          className="mt-0.5"
          disabled={!canWrite}
          disabledReason="Your role is read-only for tasks"
        />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[13px] font-medium leading-snug transition-[opacity,color] duration-200',
              done ? 'text-muted-foreground line-through opacity-60' : 'text-foreground'
            )}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>

        {task.assignedTo && (
          <AvatarWithInitials
            firstName={task.assignedTo.firstName}
            lastName={task.assignedTo.lastName}
            size="sm"
            className="mt-0.5"
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 pl-[26px]">
        <PriorityTag priority={task.priority} />
        <DueDate dueDate={task.dueDate} status={task.status} />
      </div>

      {/* Hover chrome. Also revealed by :focus-within, so the status select
          below stays reachable by keyboard without cluttering the resting card.

          Both controls here write (PATCH /tasks/:id), so the whole cluster is
          omitted for a read-only role. Leaving the drag handle in place would be
          the worst version: the card follows the cursor, drops into the new
          column, and then snaps back when the request 403s. */}
      {canWrite && (
        <div className="row-actions absolute right-1.5 top-1.5 flex items-center gap-1">
          <select
            value={task.status}
            onChange={(e) => onStatusChange(taskId, e.target.value as TaskStatus)}
            aria-label="Move task to status"
            onClick={(e) => e.stopPropagation()}
            className="h-6 rounded border border-border/60 bg-card px-1 text-[10px] text-muted-foreground outline-none focus:border-primary/50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            {...listeners}
            {...attributes}
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            title="Drag to move"
            aria-label="Drag to move"
          >
            <GripVertical size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Droppable Board Column ─────────────────────────────────────────────────────

interface BoardColumnProps {
  column: BoardColumnConfig;
  tasks: TaskItem[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onComplete: (task: TaskItem, e: React.MouseEvent) => void;
  onAdd: (status: TaskStatus) => void;
}

function BoardColumn({ column, tasks, onStatusChange, onComplete, onAdd }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
    data: { status: column.key },
  });
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);

  return (
    <div className="flex w-[300px] min-w-[300px] flex-shrink-0 flex-col">
      <div className={cn('h-[2px] rounded-t-full', column.rule)} />

      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-2.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            {column.title}
          </h3>
          <span className="rounded-full border border-border/60 bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {tasks.length}
          </span>
        </div>

        {canWrite && (
          <button
            onClick={() => onAdd(column.key)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            title={`Add task to ${column.title}`}
            aria-label={`Add task to ${column.title}`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[420px] flex-1 flex-col gap-2 rounded-xl border p-2',
          'transition-colors duration-150',
          isOver
            ? 'border-dashed border-primary/40 bg-primary/[0.04]'
            : cn('border-border/50', column.wash)
        )}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id || task._id}
            task={task}
            onStatusChange={onStatusChange}
            onComplete={onComplete}
          />
        ))}

        {tasks.length === 0 && (
          <div className="mt-1 flex h-20 items-center justify-center rounded-lg border border-dashed border-border/60">
            <span className="text-[11px] text-muted-foreground">
              {canWrite ? 'Drop a task here' : 'No tasks'}
            </span>
          </div>
        )}

        {canWrite && (
          <button
            onClick={() => onAdd(column.key)}
            className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-card hover:text-foreground"
          >
            <Plus size={12} />
            Add task
          </button>
        )}
      </div>
    </div>
  );
}

// ── Board skeleton ────────────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="flex gap-4 pb-2">
      {BOARD_COLUMNS.map((col, ci) => (
        <div key={col.key} className="flex w-[300px] min-w-[300px] flex-col">
          <div className={cn('h-[2px] rounded-t-full opacity-40', col.rule)} />
          <div className="px-3 pb-2.5 pt-2.5">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex min-h-[420px] flex-col gap-2 rounded-xl border border-border/50 p-2">
            {[...Array(ci === 1 ? 2 : 3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card p-3">
                <div className="flex gap-2.5">
                  <div className="h-4 w-4 shrink-0 animate-pulse rounded-[6px] bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted/60" />
                  </div>
                </div>
                <div className="mt-3 flex justify-between pl-[26px]">
                  <div className="h-2.5 w-14 animate-pulse rounded bg-muted/60" />
                  <div className="h-2.5 w-12 animate-pulse rounded bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main TasksPage ────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') === 'upcoming' ? 'Open' : '';

  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Queries & Mutations
  const { data, isLoading } = useTasksList({
    page,
    limit: 200, // Load all for board grouping
    search,
    status: statusFilter,
    priority: priorityFilter,
    overdue: overdueOnly,
  });

  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const completeTaskMutation = useCompleteTask();
  const deleteTaskMutation = useDeleteTask();

  // Mirrors tasks.routes.js: read is open to every role, POST/PATCH need
  // member+, DELETE needs manager+. A viewer used to get the full set of
  // controls and a 403 toast on every one of them.
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);
  const canDelete = can(PERMISSIONS.TASKS_DELETE);

  const tasks = data?.tasks || [];
  const total = data?.total || 0;

  // New Task form state
  const [newTaskData, setNewTaskData] = useState<{
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    status: TaskStatus;
    dueDate: string;
  }>({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Open',
    dueDate: '',
  });

  /** Board "+" buttons open the composer already pointed at that column. */
  const openAddModal = (status: TaskStatus = 'Open') => {
    setNewTaskData((prev) => ({ ...prev, status }));
    setIsAddModalOpen(true);
  };

  // ── Row selection ─────────────────────────────────────────────────────────
  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedIds(selected ? tasks.map((t) => t.id || (t as TaskItem & { _id: string })._id) : []);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} task(s)?`)) return;
    for (const id of selectedIds) {
      await deleteTaskMutation.mutateAsync(id);
    }
    setSelectedIds([]);
  };

  const handleDeleteOne = (task: TaskItem) => {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    deleteTaskMutation.mutate(task.id || task._id || '');
  };

  // ── Create task ───────────────────────────────────────────────────────────
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskData.title.trim()) return;
    createTaskMutation.mutate(
      {
        ...newTaskData,
        dueDate: newTaskData.dueDate ? new Date(newTaskData.dueDate).toISOString() : null,
      },
      {
        onSuccess: () => {
          setIsAddModalOpen(false);
          setNewTaskData({
            title: '',
            description: '',
            priority: 'Medium',
            status: 'Open',
            dueDate: '',
          });
        },
      }
    );
  };

  // ── Toggle complete ───────────────────────────────────────────────────────
  const handleToggleComplete = (task: TaskItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const taskId = task.id || task._id || '';
    if (task.status === 'Done') {
      updateTaskMutation.mutate({ id: taskId, data: { status: 'Open' } });
    } else {
      completeTaskMutation.mutate(taskId);
    }
  };

  // ── Board status move ─────────────────────────────────────────────────────
  const handleMoveBoardStatus = (taskId: string, newStatus: TaskStatus) => {
    updateTaskMutation.mutate({ id: taskId, data: { status: newStatus } });
  };

  // ── DnD setup ─────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { activeTask, onDragStart, onDragOver, onDragEnd } = useTaskDrag(tasks);

  function handleDragStart(e: DragStartEvent) {
    onDragStart(e);
  }
  function handleDragOver(e: DragOverEvent) {
    onDragOver(e);
  }
  function handleDragEnd(e: DragEndEvent) {
    onDragEnd(e);
  }

  // ── Board grouping ────────────────────────────────────────────────────────
  const tasksByStatus: Record<TaskStatus, TaskItem[]> = {
    Open: tasks.filter((t) => t.status === 'Open'),
    'In Progress': tasks.filter((t) => t.status === 'In Progress'),
    Done: tasks.filter((t) => t.status === 'Done'),
  };

  const isFiltered = Boolean(search || statusFilter || priorityFilter || overdueOnly);

  // ── List view columns ─────────────────────────────────────────────────────
  const columns: Column<TaskItem>[] = [
    {
      key: 'complete',
      header: '',
      width: '44px',
      accessor: (row) => (
        <TaskCheckbox
          checked={row.status === 'Done'}
          onToggle={(e) => handleToggleComplete(row, e)}
          disabled={!canWrite}
          disabledReason="Your role is read-only for tasks"
        />
      ),
    },
    {
      key: 'title',
      header: 'Task',
      accessor: (row) => {
        const done = row.status === 'Done';
        return (
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-[13px] font-medium transition-[opacity,color] duration-200',
                done ? 'text-muted-foreground line-through opacity-60' : 'text-foreground'
              )}
            >
              {row.title}
            </p>
            {row.description && (
              <p
                className={cn(
                  'truncate text-[11px] text-muted-foreground transition-opacity duration-200',
                  done && 'opacity-50'
                )}
              >
                {row.description}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      hideOnMobile: true,
      accessor: (row) => <PriorityTag priority={row.priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: 'dueDate',
      header: 'Due',
      hideOnMobile: true,
      accessor: (row) => <DueDate dueDate={row.dueDate} status={row.status} />,
    },
    {
      key: 'assignedTo',
      header: 'Assignee',
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
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Helmet>
        <title>Tasks — ElevateCRM</title>
        <meta name="description" content="Manage to-dos, follow-ups, and team assignments." />
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-[1600px] flex-col"
      >
        <PageHeader
          title="Tasks"
          count={total}
          description="Team action items, lead follow-ups, and deal milestones."
          className="mb-8"
          actions={
            <SegmentedControl
              segments={VIEW_SEGMENTS}
              value={viewMode}
              onChange={setViewMode}
              layoutId="tasks-view"
              size="md"
              iconOnly
              aria-label="View mode"
            />
          }
        />

        <FilterBar
          searchPlaceholder="Search tasks by title…"
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
              onChange: (v) => setStatusFilter(v),
              options: STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
            },
            {
              key: 'priority',
              label: 'Priority',
              value: priorityFilter,
              onChange: (v) => setPriorityFilter(v),
              options: PRIORITY_OPTIONS.map((p) => ({ label: p, value: p })),
            },
          ]}
          actions={
            <>
              <button
                onClick={() => setOverdueOnly((prev) => !prev)}
                aria-pressed={overdueOnly}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium',
                  'transition-colors duration-150',
                  overdueOnly
                    ? 'border-status-negative/30 bg-status-negative/10 text-status-negative'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <AlertCircle size={14} />
                Overdue
              </button>

              {canWrite && (
                <Button onClick={() => openAddModal('Open')}>
                  <Plus size={15} />
                  <span className="hidden sm:inline">Add Task</span>
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

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-1 flex-col">
          {viewMode === 'list' ? (
            /* `selectable` follows the delete permission: row selection exists
               only to feed the bulk-delete bar, so without it a viewer would tick
               rows and get a selection count with nothing to do. */
            <DataTable
              columns={columns}
              data={tasks}
              isLoading={isLoading}
              selectable={canDelete}
              selectedIds={selectedIds}
              onSelectRow={handleSelectRow}
              onSelectAll={handleSelectAll}
              pagination={{
                page,
                // Matches the query's limit above. These were out of sync (50
                // vs 200), so the range readout claimed "1–50 of N" while the
                // server was paging 200 at a time.
                limit: 200,
                total,
                totalPages: Math.ceil(total / 200) || 1,
                onPageChange: (p) => setPage(p),
              }}
              rowActions={
                canDelete
                  ? // Annotated because the ternary costs the parameter its
                    // contextual type — without it `row` infers as `{ id: string }`
                    // and generic inference on DataTable picks the wrong T.
                    (row: TaskItem) => (
                      <RowAction
                        icon={<Trash2 size={14} />}
                        label="Delete task"
                        tone="destructive"
                        onClick={() => handleDeleteOne(row)}
                      />
                    )
                  : undefined
              }
              emptyIcon={<CheckSquare size={22} />}
              emptyTitle={isFiltered ? 'No matching tasks' : 'Nothing on the list'}
              emptyMessage={
                isFiltered
                  ? 'Try loosening your filters — nothing matches this combination right now.'
                  : canWrite
                    ? 'Add a task to keep follow-ups and deal milestones from slipping.'
                    : 'Nothing has been assigned yet. Your role can view tasks but not create them.'
              }
              emptyAction={
                isFiltered || !canWrite ? undefined : (
                  <Button onClick={() => openAddModal('Open')}>
                    <Plus size={15} />
                    Add your first task
                  </Button>
                )
              }
            />
          ) : isLoading ? (
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <BoardSkeleton />
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="flex gap-4 pb-2"
                >
                  {BOARD_COLUMNS.map((col) => (
                    <motion.div key={col.key} variants={staggerItem} className="flex">
                      <BoardColumn
                        column={col}
                        tasks={tasksByStatus[col.key]}
                        onStatusChange={handleMoveBoardStatus}
                        onComplete={handleToggleComplete}
                        onAdd={openAddModal}
                      />
                    </motion.div>
                  ))}
                </motion.div>

                {/* Drag overlay — ghost card that follows cursor */}
                <DragOverlay dropAnimation={null}>
                  {activeTask ? (
                    <TaskCard
                      task={activeTask}
                      isDragging
                      onStatusChange={() => {}}
                      onComplete={() => {}}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Add Task Modal ──────────────────────────────────────────────────── */}
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
              aria-label="Add new task"
              className="relative w-full max-w-md rounded-xl border border-border/60 bg-card shadow-pop"
            >
              <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Add new task
                </h2>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-4 px-6 py-5">
                <Field label="Task title" htmlFor="t-title" required>
                  <input
                    id="t-title"
                    type="text"
                    autoFocus
                    required
                    placeholder="e.g. Schedule product demo with lead"
                    value={newTaskData.title}
                    onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                    className={controlClass}
                  />
                </Field>

                <Field label="Description" htmlFor="t-desc">
                  <textarea
                    id="t-desc"
                    rows={3}
                    placeholder="Add optional notes…"
                    value={newTaskData.description}
                    onChange={(e) =>
                      setNewTaskData({ ...newTaskData, description: e.target.value })
                    }
                    className={cn(controlClass, 'h-auto resize-none py-2 leading-relaxed')}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Priority" htmlFor="t-priority">
                    <select
                      id="t-priority"
                      value={newTaskData.priority}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          priority: e.target.value as 'High' | 'Medium' | 'Low',
                        })
                      }
                      className={selectClass}
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Status" htmlFor="t-status">
                    <select
                      id="t-status"
                      value={newTaskData.status}
                      onChange={(e) =>
                        setNewTaskData({ ...newTaskData, status: e.target.value as TaskStatus })
                      }
                      className={selectClass}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Due date" htmlFor="t-due">
                  <input
                    id="t-due"
                    type="date"
                    value={newTaskData.dueDate}
                    onChange={(e) => setNewTaskData({ ...newTaskData, dueDate: e.target.value })}
                    className={cn(controlClass, 'tabular-nums')}
                  />
                </Field>

                <div className="flex gap-2 pt-1">
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
                    isLoading={createTaskMutation.isPending}
                  >
                    Create task
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
