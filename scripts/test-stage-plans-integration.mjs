/** @fileoverview 供本地 Supabase runner 验证阶段跨账号拒绝与同账号双客户端 Realtime，复用一次性测试账户。 */
import assert from 'node:assert/strict';

/** 按实际数据库错误提前失败，不把 API 错误当成空数据。 */
function confirmed(response) {
  if (response.error) throw response.error;
  return response.data;
}

/** 订阅建立后才开始写入，事件必须来自新表和同一原 Task。 */
async function observe(client, owner) {
  const events = [];
  const channel = client.channel('stage-contract-' + crypto.randomUUID());
  for (const table of ['stage_plans', 'tasks']) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: 'owner_id=eq.' + owner },
      (payload) => events.push({ table, payload }),
    );
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Stage Realtime subscription timed out.')),
      15_000,
    );
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
      if (status === 'CHANNEL_ERROR') {
        clearTimeout(timer);
        reject(new Error('Stage Realtime channel failed.'));
      }
    });
  });
  return { events, channel };
}

/** 等待具体确认事件，避免把轮询读取成功误报为 Realtime 成功。 */
async function awaitEvent(events, matches) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    if (events.some(matches)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Expected stage/task Realtime event did not arrive.');
}

/** 阶段与清单共用原 Task；观察客户端独立认证，另一个账号不能读写关联。 */
export async function testStagePlanCommands(owner, writer, outsider, reader) {
  const { events, channel } = await observe(reader, owner);
  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const tasks = Array.from({ length: 16 }, (_, i) => ({
    id: crypto.randomUUID(),
    title: '阶段验收' + i,
  }));
  const args = {
    p_id: id,
    p_name: '阶段云同步验收',
    p_start_date: date,
    p_end_date: date,
    p_home_visible: true,
    p_tasks: tasks,
  };
  try {
    const first = confirmed(await writer.rpc('create_stage_plan', args));
    assert.equal(first.tasks.length, 16);
    confirmed(await writer.rpc('create_stage_plan', args));
    await awaitEvent(
      events,
      (event) => event.table === 'stage_plans' && event.payload.new.id === id,
    );
    assert.equal(
      confirmed(await reader.from('stage_plans').select('*').eq('id', id)).length,
      1,
    );
    assert.deepEqual(
      confirmed(await outsider.from('stage_plans').select('id').eq('id', id)),
      [],
    );
    const foreign = await outsider.rpc('append_stage_task', {
      p_stage_id: id,
      p_task_id: crypto.randomUUID(),
      p_title: '不可写入',
    });
    assert.match(foreign.error?.message ?? '', /STAGE_NOT_FOUND/);
    confirmed(
      await writer.rpc('transition_task', {
        p_task_id: tasks[0].id,
        p_transition: 'scheduled',
        p_target_date: date,
        p_time_zone: 'UTC',
      }),
    );
    await awaitEvent(
      events,
      (event) =>
        event.table === 'tasks' &&
        event.payload.new.id === tasks[0].id &&
        event.payload.new.status === 'active',
    );
    const scheduled = confirmed(
      await reader.from('tasks').select('*').eq('id', tasks[0].id).single(),
    );
    assert.equal(scheduled.stage_plan_id, id);
    assert.equal(scheduled.scheduled_date, date);
    const changes = await Promise.all(
      [writer, reader].map((client, i) =>
        client.rpc('update_stage_plan', {
          p_id: id,
          p_expected_updated_at: first.plan.updated_at,
          p_changes: { name: '并发保存' + i, home_visible: false },
        }),
      ),
    );
    assert.equal(changes.filter((result) => !result.error).length, 1);
    assert.match(
      changes.find((result) => result.error)?.error.message ?? '',
      /STAGE_CONFLICT/,
    );
    const saved = confirmed(changes.find((result) => !result.error));
    await awaitEvent(
      events,
      (event) =>
        event.table === 'stage_plans' &&
        event.payload.new.id === id &&
        !event.payload.new.home_visible,
    );
    confirmed(
      await writer.rpc('soft_delete_stage_plan', {
        p_id: id,
        p_expected_updated_at: saved.updated_at,
      }),
    );
    const retained = confirmed(
      await reader
        .from('tasks')
        .select('*')
        .in(
          'id',
          tasks.map((task) => task.id),
        ),
    );
    assert.equal(retained.length, 16);
    assert.ok(retained.every((task) => task.stage_plan_id === null));
    assert.equal(retained.find((task) => task.id === tasks[0].id).scheduled_date, date);
    console.log(
      'Stage plans Supabase: RLS, same Task, concurrent version check and two-client Realtime passed.',
    );
  } finally {
    await reader.removeChannel(channel);
  }
}
