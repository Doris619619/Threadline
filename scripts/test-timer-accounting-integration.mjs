/** @fileoverview 用真实 Supabase REST/RPC 验证并行会话原子保存、幂等重试和统计视图的跨账号隔离。 */
import assert from 'node:assert/strict';

/** API 错误不可被空集合掩盖。 */
function confirmed(response) {
  if (response.error) throw response.error;
  return response.data;
}

/** 只由本地集成 runner 的临时账号调用；结束后账号清理由父 runner 负责。 */
export async function testTimerAccounting(owner, other, projectId) {
  const tasks = confirmed(
    await owner
      .from('tasks')
      .insert(
        [0, 1, 2].map((index) => ({
          id: crypto.randomUUID(),
          title: '并行 API 验收 ' + index,
          project_id: projectId,
          status: 'active',
          scheduled_date: '2026-10-15',
        })),
      )
      .select(),
  ).sort((a, b) => a.title.localeCompare(b.title));
  const start = Date.parse('2026-10-15T14:00Z');
  const requests = tasks.map((task, index) => ({
    p_task_id: task.id,
    p_minutes: 90 - index * 30,
    p_entry_date: '2026-10-15',
    p_expected: Object.fromEntries(
      [
        'status',
        'scheduled_date',
        'deleted_at',
        'project_id',
        'actual_duration_minutes',
        'completed',
      ].map((key) => [key, task[key]]),
    ),
    p_recording: {
      id: crypto.randomUUID(),
      timezone: 'UTC',
      intervals: [{ start: start + index * 30 * 60000, end: start + 90 * 60000 }],
    },
  }));
  await Promise.all(
    requests.map(async (request) =>
      confirmed(await owner.rpc('record_task_timer', request)),
    ),
  );
  confirmed(await owner.rpc('record_task_timer', requests[0]));
  const ids = tasks.map((task) => task.id);
  const raw = confirmed(
    await owner.from('task_time_entries').select('*').in('task_id', ids),
  );
  assert.equal(
    raw.reduce((sum, row) => sum + row.minutes, 0),
    180,
  );
  const stats = confirmed(
    await owner.from('task_time_statistics').select('*').in('task_id', ids),
  );
  assert.deepEqual(
    ids.map((id) =>
      stats
        .filter((row) => row.task_id === id)
        .reduce((sum, row) => sum + Number(row.minutes), 0),
    ),
    [55, 25, 10],
  );
  assert.equal(
    confirmed(await other.from('task_time_statistics').select('*').in('task_id', ids))
      .length,
    0,
  );
  assert.equal(
    confirmed(await other.from('task_timer_records').select('*').in('task_id', ids))
      .length,
    0,
  );
  console.log(
    'Timer REST/RPC: raw 180, allocated 90, idempotency and account isolation passed.',
  );
}
