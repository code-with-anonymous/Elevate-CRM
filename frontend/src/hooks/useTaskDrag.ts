// ─────────────────────────────────────────────────────────────────────────────
// hooks/useTaskDrag.ts
// Manages @dnd-kit drag state + optimistic status moves for the tasks board
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateTask } from './useTasks';
import { TASKS_QK } from './useTasks';
import type { TaskItem, GetTasksResponse } from '@/services/api/taskService';

type TaskStatus = 'Open' | 'In Progress' | 'Done';

interface UseTaskDragReturn {
  activeTask: TaskItem | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver:  (event: DragOverEvent)  => void;
  onDragEnd:   (event: DragEndEvent)   => void;
}

export function useTaskDrag(tasks: TaskItem[]): UseTaskDragReturn {
  const qc = useQueryClient();
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);

  /** Track which card is being dragged */
  const onDragStart = useCallback((event: DragStartEvent) => {
    const found = tasks.find((t) => (t.id || t._id) === event.active.id);
    setActiveTask(found ?? null);
  }, [tasks]);

  /** Optimistically move the task in every cached list as soon as it hovers a new column */
  const onDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activeTask) return;

    const targetStatus = over.data?.current?.status as TaskStatus | undefined;
    if (!targetStatus || targetStatus === activeTask.status) return;

    // Optimistically update every matching tasks query
    qc.setQueriesData<GetTasksResponse>(
      { queryKey: TASKS_QK.all },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) =>
            (t.id || t._id) === (activeTask.id || activeTask._id)
              ? { ...t, status: targetStatus }
              : t
          ),
        };
      }
    );

    // Keep activeTask in sync so the DragOverlay shows the new column colour
    setActiveTask((prev) => (prev ? { ...prev, status: targetStatus } : prev));
  }, [activeTask, qc]);

  /** On drop: persist the status change to the server */
  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { over, active } = event;
    setActiveTask(null);

    if (!over) {
      // Dropped outside a column — revert
      qc.invalidateQueries({ queryKey: TASKS_QK.all });
      return;
    }

    const targetStatus = over.data?.current?.status as TaskStatus | undefined;
    const taskId       = active.id as string;
    const original     = tasks.find((t) => (t.id || t._id) === taskId);

    if (!targetStatus || !original || targetStatus === original.status) return;

    updateTask.mutate({ id: taskId, data: { status: targetStatus } });
  }, [tasks, updateTask, qc]);

  return { activeTask, onDragStart, onDragOver, onDragEnd };
}
