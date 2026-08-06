// ─────────────────────────────────────────────────────────────────────────────
// pages/tasks/TasksPage.tsx
// List view + Board view (drag-and-drop kanban) for tasks
// URL param: ?filter=upcoming  → pre-selects "Open" status column
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Trash2,
  CheckCircle2,
  List,
  LayoutGrid,
  Calendar,
  AlertCircle,
  X,
  Loader2,
  GripVertical,
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
import DataTable, { Column } from '@/components/common/DataTable';
import FilterBar from '@/components/common/FilterBar';
import StatusBadge from '@/components/common/StatusBadge';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import {
  useTasksList,
  useCreateTask,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
} from '@/hooks/useTasks';
import { useTaskDrag } from '@/hooks/useTaskDrag';
import { TaskItem } from '@/services/api/taskService';
import dayjs from 'dayjs';

// ── Board Column types ─────────────────────────────────────────────────────────

type TaskStatus = 'Open' | 'In Progress' | 'Done';

const BOARD_COLUMNS: {
  key: TaskStatus;
  title: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}[] = [
  {
    key: 'Open',
    title: 'To Do',
    color: 'text-blue-400',
    bg: 'bg-blue-500/8',
    border: 'border-blue-500/25',
    dot: 'bg-blue-500',
  },
  {
    key: 'In Progress',
    title: 'In Progress',
    color: 'text-amber-400',
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/25',
    dot: 'bg-amber-500',
  },
  {
    key: 'Done',
    title: 'Completed',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/25',
    dot: 'bg-emerald-500',
  },
];

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

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const isPast =
    task.dueDate &&
    dayjs(task.dueDate).isBefore(dayjs(), 'day') &&
    task.status !== 'Done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group rounded-lg border bg-background p-3 shadow-xs transition-all space-y-2',
        isDragging
          ? 'rotate-1 scale-105 shadow-2xl border-blue-500/60 opacity-90'
          : 'border-border hover:border-blue-500/40 hover:shadow-md',
      ].join(' ')}
    >
      {/* Header row: drag handle + title + priority badge */}
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0"
          title="Drag to move"
        >
          <GripVertical size={14} />
        </button>

        <p
          className={`flex-1 text-xs font-semibold text-foreground leading-snug ${
            task.status === 'Done' ? 'line-through opacity-50' : ''
          }`}
        >
          {task.title}
        </p>

        <StatusBadge status={task.priority} />
      </div>

      {/* Description */}
      {task.description && (
        <p className="ml-5 text-[11px] text-muted-foreground line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Footer: due date + assignee + complete button */}
      <div className="ml-5 flex items-center justify-between pt-2 border-t border-border/50 text-[10px]">
        {task.dueDate ? (
          <span
            className={`flex items-center gap-1 ${
              isPast ? 'font-bold text-red-500' : 'text-muted-foreground'
            }`}
          >
            <Calendar size={10} />
            {dayjs(task.dueDate).format('DD MMM')}
            {isPast && ' ⚠'}
          </span>
        ) : (
          <span className="text-muted-foreground/60">No due date</span>
        )}

        <div className="flex items-center gap-2">
          {task.assignedTo && (
            <AvatarWithInitials
              firstName={task.assignedTo.firstName}
              lastName={task.assignedTo.lastName}
              size="sm"
            />
          )}

          {/* Quick complete button */}
          <button
            onClick={(e) => onComplete(task, e)}
            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
              task.status === 'Done'
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-border hover:border-emerald-500'
            }`}
            title={task.status === 'Done' ? 'Mark incomplete' : 'Mark complete'}
          >
            {task.status === 'Done' && <CheckCircle2 size={12} />}
          </button>
        </div>
      </div>

      {/* Move status dropdown (keyboard fallback) */}
      <div className="ml-5">
        <select
          value={task.status}
          onChange={(e) => onStatusChange(taskId, e.target.value as TaskStatus)}
          className="w-full rounded border border-border bg-card px-1.5 py-0.5 text-[10px] outline-none"
        >
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Done">Done</option>
        </select>
      </div>
    </div>
  );
}

// ── Droppable Board Column ─────────────────────────────────────────────────────

interface BoardColumnProps {
  column: (typeof BOARD_COLUMNS)[number];
  tasks: TaskItem[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onComplete: (task: TaskItem, e: React.MouseEvent) => void;
}

function BoardColumn({ column, tasks, onStatusChange, onComplete }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
    data: { status: column.key },
  });

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] flex-shrink-0">
      {/* Column header */}
      <div
        className={`flex items-center justify-between rounded-t-xl border-t border-x px-3 py-2.5 ${column.bg} ${column.border}`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${column.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-widest ${column.color}`}>
            {column.title}
          </span>
          <span
            className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 ${column.bg} ${column.color} border ${column.border}`}
          >
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          'flex flex-col gap-2 rounded-b-xl border-b border-x p-2 min-h-[420px] flex-1 transition-colors duration-200',
          column.border,
          isOver ? `${column.bg} border-dashed` : 'bg-card/60',
        ].join(' ')}
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
          <div
            className={`flex flex-col items-center justify-center h-24 rounded-lg border border-dashed ${column.border} opacity-40 mt-2`}
          >
            <span className={`text-xs ${column.color}`}>Drop tasks here</span>
          </div>
        )}
      </div>
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
          setNewTaskData({ title: '', description: '', priority: 'Medium', status: 'Open', dueDate: '' });
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { activeTask, onDragStart, onDragOver, onDragEnd } = useTaskDrag(tasks);

  function handleDragStart(e: DragStartEvent) { onDragStart(e); }
  function handleDragOver(e: DragOverEvent)   { onDragOver(e); }
  function handleDragEnd(e: DragEndEvent)     { onDragEnd(e); }

  // ── Board grouping ────────────────────────────────────────────────────────
  const tasksByStatus: Record<TaskStatus, TaskItem[]> = {
    Open: tasks.filter((t) => t.status === 'Open'),
    'In Progress': tasks.filter((t) => t.status === 'In Progress'),
    Done: tasks.filter((t) => t.status === 'Done'),
  };

  // ── List view columns ─────────────────────────────────────────────────────
  const columns: Column<TaskItem>[] = [
    {
      key: 'complete',
      header: '',
      width: '40px',
      accessor: (row) => (
        <button
          onClick={(e) => handleToggleComplete(row, e)}
          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            row.status === 'Done'
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-border hover:border-emerald-500'
          }`}
          title={row.status === 'Done' ? 'Mark incomplete' : 'Mark complete'}
        >
          {row.status === 'Done' && <CheckCircle2 size={14} />}
        </button>
      ),
    },
    {
      key: 'title',
      header: 'TASK TITLE',
      accessor: (row) => (
        <div>
          <p
            className={`font-semibold text-foreground ${
              row.status === 'Done' ? 'line-through opacity-60' : ''
            }`}
          >
            {row.title}
          </p>
          {row.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'PRIORITY',
      accessor: (row) => <StatusBadge status={row.priority} />,
    },
    {
      key: 'status',
      header: 'STATUS',
      accessor: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'dueDate',
      header: 'DUE DATE',
      accessor: (row) => {
        if (!row.dueDate) return <span className="text-xs text-muted-foreground">—</span>;
        const isPast = dayjs(row.dueDate).isBefore(dayjs(), 'day') && row.status !== 'Done';
        return (
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              isPast ? 'font-bold text-red-500' : 'text-muted-foreground'
            }`}
          >
            <Calendar size={12} />
            {dayjs(row.dueDate).format('DD MMM YYYY')}
            {isPast && ' (Overdue)'}
          </span>
        );
      },
    },
    {
      key: 'assignedTo',
      header: 'ASSIGNED TO',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <AvatarWithInitials
            firstName={row.assignedTo?.firstName}
            lastName={row.assignedTo?.lastName}
            avatarUrl={row.assignedTo?.avatarUrl}
            size="sm"
          />
          <span className="text-xs text-muted-foreground">
            {row.assignedTo
              ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`
              : 'Unassigned'}
          </span>
        </div>
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

      <div className="flex flex-col gap-5 p-6 min-h-[calc(100vh-3.5rem)] bg-background">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                {total}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Keep track of team action items, lead follow-ups, and deal milestones.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex rounded-lg border border-border bg-card p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List size={14} />
                List
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === 'board'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid size={14} />
                Board
              </button>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-600 active:scale-[0.98]"
            >
              <Plus size={16} />
              Add Task
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterBar
            searchPlaceholder="Search tasks by title..."
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: statusFilter,
                onChange: (v) => setStatusFilter(v),
                options: [
                  { label: 'Open', value: 'Open' },
                  { label: 'In Progress', value: 'In Progress' },
                  { label: 'Done', value: 'Done' },
                ],
              },
              {
                key: 'priority',
                label: 'Priority',
                value: priorityFilter,
                onChange: (v) => setPriorityFilter(v),
                options: [
                  { label: 'High', value: 'High' },
                  { label: 'Medium', value: 'Medium' },
                  { label: 'Low', value: 'Low' },
                ],
              },
            ]}
          />

          {/* Overdue toggle */}
          <button
            onClick={() => setOverdueOnly((prev) => !prev)}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              overdueOnly
                ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlertCircle size={14} />
            Overdue Only
          </button>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/40">
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">
              {selectedIds.length} task(s) selected
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

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        {viewMode === 'list' ? (
          <DataTable
            columns={columns}
            data={tasks}
            isLoading={isLoading}
            selectable
            selectedIds={selectedIds}
            onSelectRow={handleSelectRow}
            onSelectAll={handleSelectAll}
            pagination={{
              page,
              limit: 50,
              total,
              totalPages: Math.ceil(total / 50) || 1,
              onPageChange: (p) => setPage(p),
            }}
            emptyMessage="No tasks found. Create a task to stay organized!"
          />
        ) : (
          /* ── Board View with DnD ──────────────────────────────────────── */
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
              {BOARD_COLUMNS.map((col) => (
                <BoardColumn
                  key={col.key}
                  column={col}
                  tasks={tasksByStatus[col.key]}
                  onStatusChange={handleMoveBoardStatus}
                  onComplete={handleToggleComplete}
                />
              ))}
            </div>

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
        )}
      </div>

      {/* ── Add Task Modal ──────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-foreground">Add New Task</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule product demo with lead"
                  value={newTaskData.title}
                  onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Description</label>
                <textarea
                  rows={3}
                  placeholder="Add optional notes..."
                  value={newTaskData.description}
                  onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">Priority</label>
                  <select
                    value={newTaskData.priority}
                    onChange={(e) =>
                      setNewTaskData({ ...newTaskData, priority: e.target.value as 'High' | 'Medium' | 'Low' })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground">Status</label>
                  <select
                    value={newTaskData.status}
                    onChange={(e) =>
                      setNewTaskData({ ...newTaskData, status: e.target.value as TaskStatus })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Due Date</label>
                <input
                  type="date"
                  value={newTaskData.dueDate}
                  onChange={(e) => setNewTaskData({ ...newTaskData, dueDate: e.target.value })}
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
                  disabled={createTaskMutation.isPending}
                  className="flex h-8 items-center gap-1 rounded-lg bg-blue-500 px-4 font-semibold text-white hover:bg-blue-600"
                >
                  {createTaskMutation.isPending ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    'Create Task'
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
