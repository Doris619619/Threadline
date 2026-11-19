/** @fileoverview 验证 Supabase 任务读写、原子流转以及创建历史在安全重试中的传输契约。 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSupabasePublicConfig } from '@/lib/supabase/config';
import {
  mapTask,
  SupabaseWorkspaceRepository,
} from '@/lib/supabase/workspace-repository';
import type { HistoryEvent, Task } from '@/types/domain';

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
it('keeps task stage membership and microsecond update versions for delayed-response comparisons', () => {
  const task = mapTask(
    databaseTaskRow({
      stage_plan_id: 'stage',
      updated_at: '2026-08-20T02:00:00.123456+08:00',
    }),
  );
  expect(task.stagePlanId).toBe('stage');
  expect(task.updatedAt).toBe('2026-08-20T02:00:00.123456+08:00');
});

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

/** 使用真实 Supabase/PostgREST 请求构造器和受控 HTTP 响应，验证冲突忽略而非模拟去重实现。 */
function historyTransport() {
  const request = vi.fn<typeof fetch>();
  const client = createClient('https://threadline.test', 'publishable-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: request },
  });
  const event: HistoryEvent = {
    id: '00000000-0000-4000-8000-000000000001',
    taskId: '00000000-0000-4000-8000-000000000001',
    type: 'created',
    occurredAt: '2026-11-19T10:00:00.000Z',
    payload: { title: '补齐创建历史' },
  };
  return { request, event, repository: new SupabaseWorkspaceRepository(client) };
}

describe('Supabase created-history retry boundary', () => {
  it('uses insert-ignore on the stable event id and accepts an empty duplicate response without overwriting history', async () => {
    const c = historyTransport();
    c.request
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: c.event.id }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('[]', {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    await c.repository.appendHistory(c.event, taskFixture());
    await expect(
      c.repository.appendHistory(c.event, taskFixture()),
    ).resolves.toBeUndefined();
    expect(c.request).toHaveBeenCalledTimes(2);
    for (const [input, options] of c.request.mock.calls) {
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.pathname).toBe('/rest/v1/history_events');
      expect(url.searchParams.get('on_conflict')).toBe('id');
      expect(options?.method).toBe('POST');
      const headers = new Headers(options?.headers);
      expect(headers.get('Prefer')).toContain('resolution=ignore-duplicates');
      expect(headers.get('Prefer')).not.toContain('resolution=merge-duplicates');
      expect(JSON.parse(String(options?.body))).toMatchObject({
        id: c.event.taskId,
        task_id: c.event.taskId,
        event_type: 'created',
        task_title_snapshot: '评审 PR',
        project_id_snapshot: 'project-1',
        task_date_snapshot: '2026-08-21',
      });
    }
  });

  it('keeps ordinary history strict and propagates duplicate insert failures', async () => {
    const c = historyTransport();
    c.request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '23505',
          message: 'duplicate event',
          details: null,
          hint: null,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(
      c.repository.appendHistory({ ...c.event, type: 'renamed' }),
    ).rejects.toThrow('append history: duplicate event');
    const [input, options] = c.request.mock.calls[0];
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.searchParams.has('on_conflict')).toBe(false);
    expect(new Headers(options?.headers).get('Prefer')).not.toContain(
      'resolution=ignore-duplicates',
    );
  });

  it('reports a created-history authorization failure instead of treating it as a duplicate', async () => {
    const c = historyTransport();
    c.request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '42501',
          message: 'permission denied',
          details: null,
          hint: null,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(c.repository.appendHistory(c.event)).rejects.toThrow(
      'append history: permission denied',
    );
  });
});
