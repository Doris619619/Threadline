/** @fileoverview 验证项目总览覆盖阶段、普通待安排、所有日程及历史；过滤和去重只读原 Task。 */
import { expect, it } from 'vitest';
import type { Task } from '@/types/domain';
import {
  filterProjectTasks,
  projectTasks,
  projectTaskState,
} from '@/features/projects/project-task-rules';

/** 建立同一项目中不同执行状态的原任务，调用者只覆盖当前用例需要的字段。 */
function task(id: string, changes: Partial<Task> = {}): Task {
  return {
    id,
    title: '任务 ' + id,
    projectId: 'work',
    status: 'waiting',
    completed: false,
    importance: 'normal',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    ...changes,
  };
}
it('includes a stage task scheduled for another day exactly once alongside general waiting and history', () => {
  const staged = task('stage', {
    stagePlanId: 'holiday',
    status: 'active',
    date: '2026-10-05',
  });
  const tasks = projectTasks(
    [
      staged,
      task('general'),
      task('done', { completed: true }),
      task('trash', { status: 'trashed', completed: true }),
      task('abandoned', { status: 'abandoned' }),
      staged,
      task('elsewhere', { projectId: 'course' }),
    ],
    'work',
  );
  expect(tasks.map((item) => item.id)).toEqual([
    'stage',
    'general',
    'done',
    'trash',
    'abandoned',
  ]);
  expect(filterProjectTasks(tasks, 'all', '')).toHaveLength(5);
  expect(filterProjectTasks(tasks, 'scheduled', '')).toEqual([staged]);
  expect(filterProjectTasks(tasks, 'waiting', '')[0].id).toBe('general');
  expect(filterProjectTasks(tasks, 'completed', '').map((item) => item.id)).toEqual([
    'done',
  ]);
  expect(projectTaskState(tasks[3])).toBe('trashed');
  expect(filterProjectTasks(tasks, 'all', ' STAGE ')).toEqual([staged]);
  expect(staged.stagePlanId).toBe('holiday');
});
