/** @fileoverview 验证分钟格式、独立预计输入、待安排保存及无效草稿保护。 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseEstimateMinutes, formatEstimate } from '@/features/tasks/task-time';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import type { Project, Task } from '@/types/domain';
const project: Project = {
  id: 'p',
  name: '项目',
  color: '#007aff',
  status: 'active',
  createdAt: '',
};
/** 使用真实创建 Hook，并捕获实际传入持久化边界的任务。 */
function setup(editing?: Task) {
  const createTask = vi.fn(async (task: Task) => task);
  const updateTask = vi.fn();
  const { result } = renderHook(() =>
    useTaskCreateAndEdit({
      createTask,
      updateTask,
      editing,
      projects: [project],
      selectedDate: '2026-09-05',
      createProject: async (p) => p,
    }),
  );
  return { actions: result.current, createTask, updateTask };
}
describe('independent estimates', () => {
  it.each([
    ['', undefined, '待定'],
    ['0', 0, '0min'],
    ['45', 45, '45min'],
    ['60', 60, '1h'],
    ['90', 90, '1h30min'],
  ])('formats %s minutes', (input, value, label) => {
    expect(parseEstimateMinutes(String(input))).toBe(value);
    expect(formatEstimate(value as number | undefined)).toBe(label);
  });
  it.each(['-1', '1.5', '1h', '45min', 'NaN', 'Infinity', '2147483648'])(
    'rejects invalid integer minutes %s',
    (input) => {
      expect(() => parseEstimateMinutes(input)).toThrow();
    },
  );
  it.each([
    ['', '', '', undefined],
    ['', '', '90', 90],
    ['09:00', '10:00', '', undefined],
    ['09:00', '10:00', '90', 90],
  ])(
    'stores independent start=%s end=%s estimate=%s',
    async (start, end, planned, expected) => {
      const { actions, createTask } = setup();
      await actions.createTimedTask({
        title: '独立预计',
        projectId: project.id,
        startTime: String(start),
        endTime: String(end),
        planned: String(planned),
        actual: '',
        completed: false,
      });
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          plannedDurationMinutes: expected,
          plannedStartTime: start || undefined,
          plannedEndTime: end || undefined,
        }),
      );
    },
  );
  it('keeps estimates for waiting creation, and prevents invalid writes', async () => {
    const { actions, createTask } = setup();
    await actions.createWaitingTask({
      title: '待安排',
      projectId: project.id,
      planned: '90',
    });
    expect(
      createTask.mock.calls.every(([task]) => task.plannedDurationMinutes === 90),
    ).toBe(true);
    const response = await actions.createTimedTask({
      title: '非法预计',
      projectId: project.id,
      startTime: '',
      endTime: '',
      planned: '1h',
      actual: '',
      completed: false,
    });
    expect(response).toHaveProperty('error');
    expect(createTask).toHaveBeenCalledTimes(1);
  });
});
