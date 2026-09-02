/** @fileoverview 验证任务创建与编辑在输入校验、项目解析和持久化模型上的关键约束。 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import type { Project, Task } from '@/types/domain';

const activeProject: Project = {
  id: 'project-work',
  name: '工作',
  color: '#4f8cff',
  status: 'active',
  isFallback: true,
  position: 0,
  createdAt: '2026-08-20T01:00:00.000Z',
};

/** 返回稳定的 Hook 依赖，避免测试因界面层状态而失去对业务模型的断言。 */
function createHookDependencies(editing?: Task) {
  const createProject = vi.fn().mockImplementation(async (project: Project) => project);
  const createTask = vi.fn().mockImplementation(async (task: Task) => task);
  const updateTask = vi.fn();
  return {
    createProject,
    createTask,
    editing,
    projects: [activeProject],
    selectedDate: '2026-08-21',
    updateTask,
  };
}

/** 构造 Dialog 真实提交使用的 FormData。 */
function taskForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

describe('useTaskCreateAndEdit', () => {
  it('rejects malformed timed drafts while preserving normalized times and explicit planned duration', async () => {
    const dependencies = createHookDependencies();
    const { result } = renderHook(() => useTaskCreateAndEdit(dependencies));

    await expect(
      result.current.createTimedTask({
        title: '  ',
        projectId: activeProject.id,
        startTime: '',
        endTime: '',
        planned: '',
        actual: '',
        completed: false,
      }),
    ).resolves.toEqual({ cancelled: true });
    await expect(
      result.current.createTimedTask({
        title: '格式错误',
        projectId: activeProject.id,
        startTime: '9:0',
        endTime: '',
        planned: '',
        actual: '',
        completed: false,
      }),
    ).resolves.toEqual({ error: '开始时间格式应为 08:30' });
    await expect(
      result.current.createTimedTask({
        title: '倒序时间',
        projectId: activeProject.id,
        startTime: '1000',
        endTime: '0900',
        planned: '',
        actual: '',
        completed: false,
      }),
    ).resolves.toEqual({ error: '结束时间需晚于有效的开始时间' });
    await expect(
      result.current.createTimedTask({
        title: '零时长',
        projectId: activeProject.id,
        startTime: '1000',
        endTime: '1000',
        planned: '',
        actual: '',
        completed: false,
      }),
    ).resolves.toEqual({ error: '结束时间需晚于有效的开始时间' });

    await act(async () => {
      await result.current.createTimedTask({
        title: '  评审 PR  ',
        projectId: activeProject.id,
        startTime: '830',
        endTime: '1000',
        planned: '45min',
        actual: '45min',
        completed: true,
      });
    });

    expect(dependencies.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: activeProject.id,
        title: '评审 PR',
        date: '2026-08-21',
        plannedStartTime: '08:30',
        plannedEndTime: '10:00',
        plannedDurationMinutes: 90,
        actualDurationMinutes: 45,
        schedulePendingTime: false,
        completed: true,
        status: 'active',
      }),
    );
  });

  it('automatically calculates planned duration from valid start and end times, overriding old planned draft', async () => {
    const dependencies = createHookDependencies();
    const { result } = renderHook(() => useTaskCreateAndEdit(dependencies));

    await act(async () => {
      await result.current.createTimedTask({
        title: '时长覆盖测试',
        projectId: activeProject.id,
        startTime: '08:30',
        endTime: '10:00',
        planned: '45min',
        actual: '',
        completed: false,
      });
    });

    expect(dependencies.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '时长覆盖测试',
        plannedStartTime: '08:30',
        plannedEndTime: '10:00',
        plannedDurationMinutes: 90,
      }),
    );
  });

  it('keeps cross-midnight rejection and sends valid create or edit models to their separate persistence paths', async () => {
    const creating = createHookDependencies();
    const { result, rerender } = renderHook(
      (dependencies: ReturnType<typeof createHookDependencies>) =>
        useTaskCreateAndEdit(dependencies),
      { initialProps: creating },
    );

    await expect(
      result.current.saveTask(
        taskForm({
          title: '跨午夜',
          project: activeProject.id,
          start: '2300',
          end: '0100',
          planned: '',
          actual: '',
        }),
      ),
    ).resolves.toBe('暂不支持跨午夜任务，请选择同一天内的时间');
    expect(creating.createTask).not.toHaveBeenCalled();

    await act(async () => {
      await expect(
        result.current.saveTask(
          taskForm({
            title: '新建任务',
            project: activeProject.id,
            start: '1400',
            end: '1530',
            planned: '999',
            actual: '30',
          }),
        ),
      ).resolves.toBeUndefined();
    });
    expect(creating.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新建任务',
        projectId: activeProject.id,
        date: '2026-08-21',
        plannedStartTime: '14:00',
        plannedEndTime: '15:30',
        plannedDurationMinutes: 90,
        actualDurationMinutes: 30,
      }),
    );

    const editing: Task = {
      id: 'task-editing',
      projectId: activeProject.id,
      title: '旧标题',
      date: '2026-08-19',
      completed: false,
      status: 'active',
      createdAt: '2026-08-19T01:00:00.000Z',
      updatedAt: '2026-08-19T01:00:00.000Z',
    };
    const updating = createHookDependencies(editing);
    rerender(updating);

    await act(async () => {
      await expect(
        result.current.saveTask(
          taskForm({
            title: '编辑后的标题',
            project: activeProject.id,
            start: '',
            end: '',
            planned: '20',
            actual: '',
          }),
        ),
      ).resolves.toBeUndefined();
    });
    expect(updating.updateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: editing.id,
        title: '编辑后的标题',
        date: '2026-08-19',
        plannedDurationMinutes: 20,
      }),
    );
    expect(updating.createTask).not.toHaveBeenCalled();
  });
});
