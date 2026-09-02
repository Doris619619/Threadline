/** @fileoverview 验证每日收尾按业务日 ledger 汇总任务耗时，并继续合并 Daily 父子耗时。 */

import { describe, expect, it, vi } from 'vitest';
import { useCloseDay } from '@/features/tasks/hooks/use-close-day';
import type { Project, Task, TaskTimeEntry } from '@/types/domain';

const projects: Project[] = [
  {
    id: 'research',
    name: '科研',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'course',
    name: '课程',
    color: '#8b7cf6',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const shown: Task[] = [
  {
    id: 'task-1',
    projectId: 'course',
    title: '跨日任务',
    date: '2026-08-31',
    actualDurationMinutes: 120,
    completed: true,
    status: 'active',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  },
];

const taskTimeEntries: TaskTimeEntry[] = [
  {
    id: 'time-previous-day',
    taskId: 'task-1',
    projectId: 'research',
    date: '2026-08-30',
    minutes: 40,
  },
  {
    id: 'time-selected-day',
    taskId: 'task-1',
    projectId: 'research',
    date: '2026-08-31',
    minutes: 80,
  },
];

describe('close-day project minutes', () => {
  it('uses only selected-date task ledger entries instead of the movable task aggregate', async () => {
    const closeDay = vi.fn(async () => undefined);
    const submit = useCloseDay({
      closeDay,
      projects,
      selectedDate: '2026-08-31',
      shown,
      taskTimeEntries,
      taskTimeEntriesAuthoritative: true,
      tomorrow: '2026-09-01',
    });

    await submit(new FormData());

    expect(closeDay).toHaveBeenCalledWith('2026-08-31', [], {
      research: 80,
      course: 0,
    });
  });

  it('does not fall back to a cross-day aggregate when the selected date has no task entry', async () => {
    const closeDay = vi.fn(async () => undefined);
    const submit = useCloseDay({
      closeDay,
      projects,
      selectedDate: '2026-09-01',
      shown,
      taskTimeEntries,
      taskTimeEntriesAuthoritative: true,
      tomorrow: '2026-09-02',
    });

    await submit(new FormData());

    expect(closeDay).toHaveBeenCalledWith('2026-09-01', [], { research: 0, course: 0 });
  });

  it('uses task aggregates only when the adapter explicitly declares fallback mode', async () => {
    const closeDay = vi.fn(async () => undefined);
    const submit = useCloseDay({
      closeDay,
      projects,
      selectedDate: '2026-08-31',
      shown,
      taskTimeEntries: [],
      taskTimeEntriesAuthoritative: false,
      tomorrow: '2026-09-01',
    });

    await submit(new FormData());

    expect(closeDay).toHaveBeenCalledWith('2026-08-31', [], {
      research: 0,
      course: 120,
    });
  });
});
