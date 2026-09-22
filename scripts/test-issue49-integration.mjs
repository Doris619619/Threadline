/** @fileoverview 通过真实 PostgREST 并发请求验证字段 CAS、工作站锁、删除确认与收尾回滚。 */
import assert from 'node:assert/strict';
import { testIssue49Review } from './test-issue49-review-integration.mjs';

/** 只使用 runner 已建立的一次性账号和本地数据库，不读取生产连接。 */
export async function testIssue49Commands(owner, foreign, project) {
  const date = new Date().toISOString().slice(0, 10);
  const tasks = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const created = await owner
    .from('tasks')
    .insert(
      tasks.map((id) => ({
        id,
        project_id: project,
        title: 'issue49',
        status: 'active',
        scheduled_date: date,
        actual_duration_minutes: 10,
      })),
    )
    .select();
  if (created.error) throw created.error;
  const guard = { status: 'active', scheduled_date: date, deleted_at: null };
  const patch = (changes, expected) =>
    owner.rpc('update_task_fields', {
      p_task_id: tasks[0],
      p_changes: changes,
      p_expected: { ...guard, ...expected },
    });
  const results = await Promise.all([
    patch({ title: 'device A' }, { title: 'issue49' }),
    patch({ completed: true }, { completed: false }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const row = await owner.from('tasks').select('*').eq('id', tasks[0]).single();
  assert.equal(row.data.title, 'device A');
  assert.equal(row.data.completed, true);
  const conflict = await patch({ title: 'stale device' }, { title: 'issue49' });
  assert.equal(conflict.error?.code, '40001');
  const denied = await foreign.rpc('update_task_fields', {
    p_task_id: tasks[0],
    p_changes: { title: 'foreign' },
    p_expected: { ...guard, title: 'device A' },
  });
  assert.equal(denied.error?.code, 'P0002');
  const additions = await Promise.all(
    tasks.map((id) =>
      owner.rpc('apply_workstation_command', { p_command: 'add', p_task_id: id }),
    ),
  );
  for (const result of additions) if (result.error) throw result.error;
  const clear = await owner.rpc('apply_workstation_command', {
    p_command: 'clear',
    p_task_ids: [tasks[0]],
  });
  if (clear.error) throw clear.error;
  assert.ok(clear.data.some((row) => row.task_id === tasks[1]));
  assert.ok(clear.data.some((row) => row.task_id === tasks[2]));
  const zone = await owner.from('habit_settings').select('timezone').maybeSingle();
  if (zone.error) throw zone.error;
  const close = await owner.rpc('close_day_checked', {
    p_close_date: date,
    p_project_minutes: {},
    p_time_zone: zone.data?.timezone ?? 'UTC',
    p_actions: [
      { task_id: tasks[1], action: 'waiting' },
      { task_id: tasks[2], action: 'date', target_date: '2000-01-01' },
    ],
  });
  assert.equal(close.error?.code, '22023');
  const unchanged = await owner
    .from('tasks')
    .select('status')
    .eq('id', tasks[1])
    .single();
  assert.equal(unchanged.data.status, 'active');
  const ledger = await owner
    .from('task_time_entries')
    .select('minutes')
    .eq('task_id', tasks[0]);
  if (ledger.error) throw ledger.error;
  assert.equal(
    ledger.data.reduce((sum, item) => sum + item.minutes, 0),
    10,
  );
  // 两种先后次序均合法：先排序后删除，或先删除并要求排序重试。
  const [move, trash] = await Promise.all([
    owner.rpc('apply_workstation_command', {
      p_command: 'move',
      p_task_id: tasks[1],
      p_anchor_id: tasks[2],
      p_after: true,
    }),
    owner.rpc('transition_task', {
      p_task_id: tasks[2],
      p_transition: 'trashed',
      p_target_date: null,
    }),
  ]);
  if (trash.error) throw trash.error;
  if (move.error) assert.equal(move.error.code, '40001');
  const members = await owner
    .from('workstation_entries')
    .select('*')
    .is('removed_at', null);
  if (members.error) throw members.error;
  assert.ok(!members.data.some((member) => member.task_id === tasks[2]));
  assert.ok(members.data.some((member) => member.task_id === tasks[1]));
  const missingAnchor = await owner.rpc('apply_workstation_command', {
    p_command: 'move',
    p_task_id: tasks[1],
    p_anchor_id: tasks[2],
    p_after: true,
  });
  assert.equal(missingAnchor.error?.code, '40001');
  await testIssue49Review(owner, project);
}
