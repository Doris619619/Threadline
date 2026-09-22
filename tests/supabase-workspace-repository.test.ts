/** @fileoverview 验证 Supabase 任务读写 mapper 和原子状态流转 RPC 的业务边界。 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSupabasePublicConfig } from '@/lib/supabase/config';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import type { Task } from '@/types/domain';

/** 构造数据库 task row，覆盖 date、墙钟、datetime-local 与审计 instant 的不同映射语义。 */
function databaseTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    project_id: 'project-1',
    title: '评审 PR',
    scheduled_date: '2026-08-21',
    schedule_pending_time: false,
    planned_start_time: '09:30:00',
    planned_end_time: '10:45:00',
    planned_duration_minutes: 75,
    actual_duration_minutes: 30,
    completed: false,
    completed_at: null,
    status: 'active',
    importance: 'normal',
    postponed_from: null,
    postponed_to: null,
    abandoned_at: null,
    deleted_at: null,
    created_at: '2026-08-20T01:00:00+08:00',
    updated_at: '2026-08-20T02:00:00+08:00',
    ...overrides,
  };
}

/** 构造包含需要被持久化的所有任务字段的领域对象。 */
function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    projectId: 'project-1',
    title: '评审 PR',
    date: '2026-08-21',
    schedulePendingTime: false,
    plannedStartTime: '09:30',
    plannedEndTime: '10:45',
    plannedDurationMinutes: 75,
    actualDurationMinutes: 30,
    completed: false,
    status: 'active',
    importance: 'normal',
    createdAt: '2026-08-20T01:00:00.000Z',
    updatedAt: '2026-08-20T02:00:00.000Z',
    ...overrides,
  };
}

describe('SupabaseWorkspaceRepository task boundary', () => {
  it('persists a newly created scheduled task with normal importance and maps its server row', async () => {
    const single = vi.fn().mockResolvedValue({ data: databaseTaskRow(), error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const repository = new SupabaseWorkspaceRepository({
      from,
    } as unknown as SupabaseClient);

    await expect(repository.createTask(taskFixture())).resolves.toMatchObject({
      plannedStartTime: '09:30',
      plannedEndTime: '10:45',
      importance: 'normal',
      createdAt: '2026-08-19T17:00:00.000Z',
    });
    expect(from).toHaveBeenCalledWith('tasks');
    expect(insert).toHaveBeenCalledWith({
      id: 'task-1',
      project_id: 'project-1',
      title: '评审 PR',
      scheduled_date: '2026-08-21',
      schedule_pending_time: false,
      planned_start_time: '09:30:00',
      planned_end_time: '10:45:00',
      planned_duration_minutes: 75,
      actual_duration_minutes: 30,
      completed: false,
      completed_at: null,
      status: 'active',
      importance: 'normal',
      postponed_from: null,
      postponed_to: null,
      abandoned_at: null,
      deleted_at: null,
    });
  });

  it('normalizes a legacy null importance from a server row to normal', async () => {
    const single = vi.fn().mockResolvedValue({
      data: databaseTaskRow({ importance: null }),
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const repository = new SupabaseWorkspaceRepository({
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as SupabaseClient);

    await expect(repository.createTask(taskFixture())).resolves.toMatchObject({
      importance: 'normal',
    });
  });

  it('passes a nullable target date to the atomic transition RPC and returns the mapped task', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: databaseTaskRow({ status: 'active' }),
      error: null,
    });
    const repository = new SupabaseWorkspaceRepository({
      rpc,
    } as unknown as SupabaseClient);

    await expect(
      repository.transitionTask('task-1', 'rescheduled', '2099-08-24'),
    ).resolves.toMatchObject({ id: 'task-1', status: 'active' });
    expect(rpc).toHaveBeenCalledWith('transition_task', {
      p_task_id: 'task-1',
      p_transition: 'rescheduled',
      p_target_date: '2099-08-24',
      p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });
});

describe('Supabase public runtime configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a server secret in renderer configuration while accepting the local publishable endpoint', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_not_for_renderer');
    expect(readSupabasePublicConfig()).toEqual({
      configured: false,
      reason: '检测到服务端 secret；Renderer 只允许 Supabase publishable key',
    });

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_local_test');
    expect(readSupabasePublicConfig()).toEqual({
      configured: true,
      value: {
        url: 'http://127.0.0.1:54321',
        publishableKey: 'sb_publishable_local_test',
      },
    });
  });
});
