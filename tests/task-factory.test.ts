/** @fileoverview 验证领域工厂为普通日程任务提供受约束的重要性默认值。 */

import { describe, expect, it } from 'vitest';
import { makeTask } from '@/lib/task-factory';

describe('makeTask', () => {
  it('creates an active scheduled task with normal importance', () => {
    expect(makeTask('2026-09-04', 'task-1', 'project-1', '新建日程')).toMatchObject({
      status: 'active',
      importance: 'normal',
      date: '2026-09-04',
    });
  });
});
