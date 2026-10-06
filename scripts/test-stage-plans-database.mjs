/** @fileoverview 在隔离 PGlite PostgreSQL 执行原迁移和阶段 RPC/RLS/保留规则，不访问生产。 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
let checks = 0;
/** 角色与 JWT 身份放在单独事务，避免后续断言继承前一个身份。 */
async function asUser(user, query, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role ' + (user ? 'authenticated' : 'anon'));
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    return tx.query(query, params);
  });
}
/** 数据库返回后的真实断言，计入交付的验证数量。 */
function check(value, message) {
  assert.ok(value, message);
  checks++;
}
/** 拒绝路径必须实际抛出数据库错误。 */
async function rejects(action, marker) {
  await assert.rejects(action, new RegExp(marker));
  checks++;
}
try {
  await db.exec(`create schema auth; create schema private; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create extension pgcrypto with schema extensions; create publication supabase_realtime;`);
  await db.query('insert into auth.users values($1),($2)', [a, b]);
  const folder = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(folder))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    await db.exec(await readFile(new URL(file, folder), 'utf8'));
  }
  await asUser(a, 'select initialize_workspace()');
  await asUser(b, 'select initialize_workspace()');
  const id = crypto.randomUUID();
  const rows = Array.from({ length: 16 }, (_, i) => ({
    id: crypto.randomUUID(),
    title: '任务' + i,
  }));
  const params = [
    id,
    '国庆假期',
    '2026-10-01',
    '2026-10-08',
    true,
    JSON.stringify(rows),
  ];
  const create = () =>
    asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6) as result', params);
  const first = (await create()).rows[0].result;
  check(
    first.tasks.length === 16 &&
      first.tasks.every(
        (task) => task.stage_plan_id === id && task.scheduled_date === null,
      ),
    '16 unscheduled original Tasks',
  );
  await create();
  check(
    (await asUser(a, 'select id from tasks')).rows.length === 16,
    'idempotent create retains task count',
  );
  check(
    (await asUser(b, 'select * from stage_plans')).rows.length === 0,
    'owner RLS hides stages',
  );
  await rejects(() => asUser(null, 'select * from stage_plans'), 'permission denied');
  await rejects(
    () => asUser(null, 'select create_stage_plan($1,$2,$3,$4,$5,$6)', params),
    'permission denied',
  );
  await rejects(
    () =>
      asUser(b, 'select append_stage_task($1,$2,$3)', [
        id,
        crypto.randomUUID(),
        '外部任务',
      ]),
    'STAGE_NOT_FOUND',
  );
  await rejects(
    () =>
      asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6)', [
        crypto.randomUUID(),
        '错误',
        '2026-10-08',
        '2026-10-01',
        true,
        '[]',
      ]),
    'check constraint',
  );
  const badId = crypto.randomUUID();
  await rejects(
    () =>
      asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6)', [
        badId,
        '事务回滚',
        '2026-10-01',
        '2026-10-08',
        true,
        JSON.stringify([
          { id: crypto.randomUUID(), title: '正常' },
          { id: crypto.randomUUID(), title: '' },
        ]),
      ]),
    'check constraint',
  );
  check(
    (await db.query('select id from stage_plans where id=$1', [badId])).rows.length ===
      0,
    'invalid batch rolls back stage and tasks',
  );
  const today = new Date().toISOString().slice(0, 10);
  await asUser(a, 'select transition_task($1,$2,$3,$4)', [
    rows[0].id,
    'scheduled',
    today,
    'UTC',
  ]);
  check(
    (await asUser(a, 'select * from tasks where id=$1', [rows[0].id])).rows[0]
      .stage_plan_id === id,
    'scheduling keeps stage ID',
  );
  await asUser(a, 'select complete_waiting_task($1,$2)', [rows[1].id, today]);
  check(
    (await asUser(a, 'select * from tasks where id=$1', [rows[1].id])).rows[0]
      .completed,
    'completion uses original command',
  );
  const added = crypto.randomUUID();
  await asUser(a, 'select append_stage_task($1,$2,$3)', [id, added, '追加']);
  await asUser(a, 'select append_stage_task($1,$2,$3)', [id, added, '追加']);
  check(
    (await asUser(a, 'select id from tasks')).rows.length === 17,
    'append retry does not duplicate',
  );
  const updated = (
    await asUser(a, 'select to_jsonb(update_stage_plan($1,$2,$3)) as result', [
      id,
      first.plan.updated_at,
      JSON.stringify({ home_visible: false }),
    ])
  ).rows[0].result;
  await rejects(
    () =>
      asUser(a, 'select update_stage_plan($1,$2,$3)', [
        id,
        first.plan.updated_at,
        JSON.stringify({ name: '旧表单' }),
      ]),
    'STAGE_CONFLICT',
  );
  await db.query(
    "update tasks set status='trashed', deleted_at=now()-interval '40 days' where id=$1",
    [rows[2].id],
  );
  await db.exec('select private.purge_expired_tasks()');
  check(
    (await db.query('select id from tasks where id=$1', [rows[2].id])).rows.length ===
      1,
    'stage trash survives ordinary purge',
  );
  await asUser(a, 'select remove_stage_task($1,$2)', [id, added]);
  check(
    (await db.query('select stage_plan_id from tasks where id=$1', [added])).rows[0]
      .stage_plan_id === null,
    'detach becomes ordinary Task',
  );
  await asUser(a, 'select soft_delete_stage_plan($1,$2)', [id, updated.updated_at]);
  check(
    (await db.query('select id from tasks')).rows.length === 17,
    'delete stage preserves every Task',
  );
  check(
    (await db.query('select id from tasks where stage_plan_id is not null')).rows
      .length === 0,
    'delete atomically releases stage ownership',
  );
  check(
    (await db.query('select scheduled_date::text from tasks where id=$1', [rows[0].id]))
      .rows[0].scheduled_date === today,
    'delete keeps schedule date',
  );
  await db.exec('select private.purge_expired_tasks()');
  check(
    (await db.query('select id from tasks where id=$1', [rows[2].id])).rows.length ===
      0,
    'detached ordinary trash follows original purge',
  );
  await rejects(
    () =>
      asUser(a, 'select append_stage_task($1,$2,$3)', [
        id,
        crypto.randomUUID(),
        '已删除阶段',
      ]),
    'STAGE_NOT_FOUND',
  );
  const work = (await asUser(a, "select id from projects where name='工作'")).rows[0]
    .id;
  const foreignProject = (await asUser(b, 'select id from projects where is_fallback'))
    .rows[0].id;
  const selectedStage = crypto.randomUUID();
  const selectedTask = crypto.randomUUID();
  const selected = (
    await asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6) as result', [
      selectedStage,
      '归属测试',
      '2026-10-01',
      '2026-10-08',
      true,
      JSON.stringify([{ id: selectedTask, title: '工作项', projectId: work }]),
    ])
  ).rows[0].result;
  check(selected.tasks[0].project_id === work, 'create preserves chosen project');
  const extraTask = crypto.randomUUID();
  await asUser(a, 'select append_stage_task($1,$2,$3,$4)', [
    selectedStage,
    extraTask,
    '追加工作项',
    work,
  ]);
  await asUser(a, 'select append_stage_task($1,$2,$3,$4)', [
    selectedStage,
    extraTask,
    '追加工作项',
    work,
  ]);
  check(
    (await asUser(a, 'select * from tasks where id=$1', [extraTask])).rows[0]
      .project_id === work,
    'append preserves chosen project and retry',
  );
  await rejects(
    () =>
      asUser(a, 'select append_stage_task($1,$2,$3,$4)', [
        selectedStage,
        crypto.randomUUID(),
        '跨账号项目',
        foreignProject,
      ]),
    'ACTIVE_PROJECT_NOT_FOUND',
  );
  const rejectedStage = crypto.randomUUID();
  await rejects(
    () =>
      asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6)', [
        rejectedStage,
        '隔离测试',
        '2026-10-01',
        '2026-10-08',
        true,
        JSON.stringify([
          { id: crypto.randomUUID(), title: '有效', projectId: work },
          { id: crypto.randomUUID(), title: '无权项目', projectId: foreignProject },
        ]),
      ]),
    'ACTIVE_PROJECT_NOT_FOUND',
  );
  check(
    (await asUser(a, 'select id from stage_plans where id=$1', [rejectedStage])).rows
      .length === 0,
    'bad project rolls back entire stage batch',
  );
  await asUser(a, 'select transition_task($1,$2,$3,$4)', [
    selectedTask,
    'scheduled',
    today,
    'UTC',
  ]);
  check(
    (await asUser(a, 'select * from tasks where id=$1', [selectedTask])).rows[0]
      .project_id === work,
    'schedule retains project',
  );
  await asUser(
    a,
    "update projects set status='archived', archived_at=now() where id=$1",
    [work],
  );
  await rejects(
    () =>
      asUser(a, 'select append_stage_task($1,$2,$3,$4)', [
        selectedStage,
        crypto.randomUUID(),
        '归档项目',
        work,
      ]),
    'ACTIVE_PROJECT_NOT_FOUND',
  );
  await asUser(a, 'select append_stage_task($1,$2,$3,$4)', [
    selectedStage,
    extraTask,
    '追加工作项',
    work,
  ]);
  check(
    (await asUser(a, 'select id from tasks where stage_plan_id=$1', [selectedStage]))
      .rows.length === 2,
    'confirmed retry still succeeds after project archive',
  );
  await asUser(a, 'select soft_delete_stage_plan($1,$2)', [
    selectedStage,
    selected.plan.updated_at,
  ]);
  check(
    (await asUser(a, 'select * from tasks where id=$1', [selectedTask])).rows[0]
      .project_id === work,
    'stage removal retains chosen project',
  );

  // 预计分钟与阶段创建/追加同一事务，失败不得留下部分阶段或任务。
  const timedStage = crypto.randomUUID();
  const timedTask = crypto.randomUUID();
  const timed = (
    await asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6) as result', [
      timedStage,
      '时间分布',
      '2026-10-01',
      '2026-10-08',
      true,
      JSON.stringify([{ id: timedTask, title: '阅读', plannedDurationMinutes: 90 }]),
    ])
  ).rows[0].result;
  check(
    timed.tasks[0].planned_duration_minutes === 90,
    'create saves estimate atomically',
  );
  const appendId = crypto.randomUUID();
  const timedAppend = () =>
    asUser(a, 'select to_jsonb(append_stage_task($1,$2,$3,$4,$5)) as task', [
      timedStage,
      appendId,
      '报告',
      null,
      120,
    ]);
  check(
    (await timedAppend()).rows[0].task.planned_duration_minutes === 120,
    'append saves estimate',
  );
  await timedAppend();
  await rejects(
    () =>
      asUser(a, 'select append_stage_task($1,$2,$3,$4,$5)', [
        timedStage,
        appendId,
        '报告',
        null,
        30,
      ]),
    'STAGE_REQUEST_REUSED',
  );
  await rejects(
    () =>
      asUser(b, 'select append_stage_task($1,$2,$3,$4,$5)', [
        timedStage,
        crypto.randomUUID(),
        '跨账号',
        null,
        90,
      ]),
    'STAGE_NOT_FOUND',
  );
  await rejects(
    () =>
      asUser(a, 'select append_stage_task($1,$2,$3,$4,$5)', [
        timedStage,
        crypto.randomUUID(),
        '负数',
        null,
        -1,
      ]),
    'check constraint',
  );
  const invalidStage = crypto.randomUUID();
  await rejects(
    () =>
      asUser(a, 'select create_stage_plan($1,$2,$3,$4,$5,$6)', [
        invalidStage,
        '非法估时',
        '2026-10-01',
        '2026-10-08',
        true,
        JSON.stringify([
          { id: crypto.randomUUID(), title: '正常', plannedDurationMinutes: 30 },
          { id: crypto.randomUUID(), title: '负数', plannedDurationMinutes: -1 },
        ]),
      ]),
    'check constraint',
  );
  check(
    (await asUser(a, 'select id from stage_plans where id=$1', [invalidStage])).rows
      .length === 0,
    'invalid estimate rolls back whole stage',
  );
  // 显式日期实际命令保持未安排 Task，完成计时才沿用原完成待办规则。
  /** 读取真正服务端字段作为冲突基准，每次失败保留原任务与账本。 */
  async function actualGuard(taskId, complete = false) {
    const task = (await asUser(a, 'select * from tasks where id=$1', [taskId])).rows[0];
    return Object.fromEntries(
      [
        'status',
        'scheduled_date',
        'deleted_at',
        'project_id',
        'actual_duration_minutes',
        ...(complete ? ['completed'] : []),
      ].map((key) => [key, task[key]]),
    );
  }
  const beforeActual = await actualGuard(timedTask);
  await asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
    timedTask,
    15,
    '2026-10-03',
    JSON.stringify(beforeActual),
  ]);
  check(
    (await actualGuard(timedTask)).status === 'waiting',
    'actual on waiting retains state',
  );
  check(
    (await actualGuard(timedTask)).scheduled_date === null,
    'actual does not schedule waiting task',
  );
  await rejects(
    () =>
      asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
        timedTask,
        15,
        '2026-10-03',
        JSON.stringify(beforeActual),
      ]),
    'TASK_FIELD_CONFLICT',
  );
  await asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
    timedTask,
    25,
    '2026-10-04',
    JSON.stringify(await actualGuard(timedTask)),
  ]);
  check(
    (
      await asUser(
        a,
        'select minutes from task_time_entries where task_id=$1 order by entry_date',
        [timedTask],
      )
    ).rows
      .map((r) => r.minutes)
      .join(',') === '15,10',
    'actual dates retain independent balances',
  );
  const guard25 = await actualGuard(timedTask);
  await rejects(
    () =>
      asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
        timedTask,
        0,
        '2026-10-04',
        JSON.stringify(guard25),
      ]),
    'TASK_ACTUAL_BELOW_FIXED_HISTORY',
  );
  check(
    (await actualGuard(timedTask)).actual_duration_minutes === 25,
    'failed reduction rolls back task total',
  );
  await rejects(
    () =>
      asUser(b, 'select record_task_actual($1,$2,$3,$4)', [
        timedTask,
        30,
        '2026-10-04',
        JSON.stringify(guard25),
      ]),
    'TASK_NOT_FOUND',
  );
  await rejects(
    () =>
      asUser(null, 'select record_task_actual($1,$2,$3,$4)', [
        timedTask,
        30,
        '2026-10-04',
        JSON.stringify(guard25),
      ]),
    'permission denied',
  );
  await rejects(
    () =>
      asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
        timedTask,
        -1,
        '2026-10-04',
        JSON.stringify(guard25),
      ]),
    'INVALID_TASK_ACTUAL',
  );
  await rejects(
    () =>
      asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
        timedTask,
        30,
        null,
        JSON.stringify(guard25),
      ]),
    'INVALID_TASK_ACTUAL',
  );
  await rejects(
    () =>
      asUser(a, 'update tasks set actual_duration_minutes=30 where id=$1', [timedTask]),
    'TASK_ACTUAL_DATE_REQUIRED',
  );
  await asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
    timedTask,
    15,
    '2026-10-04',
    JSON.stringify(await actualGuard(timedTask)),
  ]);
  await asUser(a, 'select record_task_actual($1,$2,$3,$4)', [
    timedTask,
    null,
    '2026-10-03',
    JSON.stringify(await actualGuard(timedTask)),
  ]);
  check(
    (await actualGuard(timedTask)).actual_duration_minutes === null,
    'clear is not zero and leaves ledger balance zero',
  );
  const waitingCompleteGuard = await actualGuard(timedTask, true);
  await asUser(a, 'select record_task_actual($1,$2,$3,$4,$5)', [
    timedTask,
    30,
    '2026-10-04',
    JSON.stringify(waitingCompleteGuard),
    true,
  ]);
  const completedTask = (
    await asUser(a, 'select * from tasks where id=$1', [timedTask])
  ).rows[0];
  check(
    completedTask.completed &&
      completedTask.status === 'active' &&
      completedTask.scheduled_date.toISOString().startsWith('2026-10-04'),
    'timer actual and waiting completion are one transaction',
  );
  await rejects(
    () =>
      asUser(a, 'select record_task_actual($1,$2,$3,$4,$5)', [
        timedTask,
        30,
        '2026-10-04',
        JSON.stringify(waitingCompleteGuard),
        true,
      ]),
    'TASK_FIELD_CONFLICT',
  );
  await asUser(a, 'update tasks set actual_duration_minutes=35 where id=$1', [
    timedTask,
  ]);
  check(
    (
      await asUser(
        a,
        "select minutes from task_time_entries where task_id=$1 and entry_date='2026-10-04'",
        [timedTask],
      )
    ).rows[0].minutes === 35,
    'ordinary actual editing retains scheduled date after explicit command',
  );
  console.log('Stage plans PostgreSQL: ' + checks + ' checks passed.');
} catch (error) {
  console.error('Stage database check failed:', error.message, error.code ?? '');
  process.exitCode = 1;
} finally {
  await db.close();
}
