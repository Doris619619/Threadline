/** @fileoverview 验证任务工作流的删除副作用、未来移期约束与本地恢复语义。 */

import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskWorkflow } from '@/features/tasks/hooks/use-task-workflow';
import type { AnnotationStroke, Task } from '@/types/domain';

/** 构造完整任务，以便 workflow 测试只覆盖状态流转行为而非类型缺口。 */
function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    projectId: 'project-1',
    title: '整理周报',
    date: '2026-08-20',
    completed: false,
    status: 'active',
    importance: 'normal',
    createdAt: '2026-08-20T01:00:00.000Z',
    updatedAt: '2026-08-20T01:00:00.000Z',
    ...overrides,
  };
}

/** 提供能执行 React reducer 形式更新的最小状态容器。 */
function stateContainer<Value>(initial: Value) {
  let value = initial;
  const update = vi.fn((next: SetStateAction<Value>) => {
    value =
      typeof next === 'function' ? (next as (current: Value) => Value)(value) : next;
  }) as unknown as Dispatch<SetStateAction<Value>>;
  return { read: () => value, update };
}

describe('useTaskWorkflow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());
  it('leaves visual bindings intact until the provider confirms the transactional transition', () => {
    const currentTask = taskFixture();
    const tasks = stateContainer([currentTask]);
    const annotations = stateContainer<AnnotationStroke[]>([
      {
        id: 'annotation-task',
        targetScope: 'global',
        targetTaskId: currentTask.id,
        points: [],
        color: '#f00',
        strokeWidth: 1,
        createdAt: '2026-08-20T01:00:00.000Z',
      },
      {
        id: 'annotation-other',
        targetScope: 'global',
        targetTaskId: 'task-other',
        points: [],
        color: '#0f0',
        strokeWidth: 1,
        createdAt: '2026-08-20T01:00:00.000Z',
      },
    ]);
    const workstation = stateContainer([currentTask.id, 'task-other']);
    const transitionTask = vi.fn().mockResolvedValue(currentTask);
    const { result } = renderHook(() =>
      useTaskWorkflow({
        tasks: tasks.read(),
        selectedDate: '2026-08-21',
        updateTasks: tasks.update,
        updateAnnotationStrokes: annotations.update,
        updateWorkstationTaskIds: workstation.update,
        transitionTask,
      }),
    );

    act(() => result.current.moveTask(currentTask.id, 'trashed'));

    expect(annotations.read()).toHaveLength(2);
    expect(workstation.read()).toEqual([currentTask.id, 'task-other']);
    expect(transitionTask).toHaveBeenCalledWith(currentTask.id, 'trashed');
  });

  it('rejects past dates and restores a non-completed trashed task locally', async () => {
    const currentTask = taskFixture({
      status: 'trashed',
      completedAt: undefined,
      deletedAt: '2026-08-20T02:00:00.000Z',
    });
    const tasks = stateContainer([currentTask]);
    const annotations = stateContainer<AnnotationStroke[]>([]);
    const workstation = stateContainer<string[]>([]);
    const transitionTask = vi.fn().mockResolvedValue(currentTask);
    const { result } = renderHook(() =>
      useTaskWorkflow({
        tasks: tasks.read(),
        selectedDate: '2026-08-21',
        updateTasks: tasks.update,
        updateAnnotationStrokes: annotations.update,
        updateWorkstationTaskIds: workstation.update,
        transitionTask,
      }),
    );

    expect(
      await result.current.rescheduleTask(undefined, '2026-08-22'),
    ).toBeUndefined();
    expect(
      await result.current.rescheduleTask(
        taskFixture({ completed: true }),
        '2026-08-22',
      ),
    ).toBe('请先取消完成再移期');
    expect(await result.current.rescheduleTask(currentTask, '2026-08-20')).toBe(
      '请选择今天或未来日期',
    );
    expect(
      await result.current.rescheduleTask(currentTask, '2026-08-22'),
    ).toBeUndefined();
    expect(transitionTask).toHaveBeenCalledWith(
      currentTask.id,
      'rescheduled',
      '2026-08-22',
    );

    act(() => result.current.moveTask(currentTask.id, 'active'));

    expect(tasks.read()[0]).toMatchObject({
      status: 'active',
      date: '2026-08-21',
      completed: false,
      completedAt: undefined,
      deletedAt: undefined,
    });
  });
});
