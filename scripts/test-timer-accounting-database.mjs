/** @fileoverview 在隔离 PostgreSQL 执行真实迁移，验证计时原子提交、RLS、幂等、去重分配及原始历史保留。 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let checks = 0;
/** 每次调用独立设置账号及数据库角色，真实触发权限检查。 */
async function asUser(user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role ' + (user ? 'authenticated' : 'anon'));
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    return tx.query(sql, params);
  });
}
/** 计数的断言均检查真实数据库输出。 */
function check(value, message) {
  assert.ok(value, message);
  checks++;
}
/** 失败路径必须由数据库拒绝而非客户端模拟。 */
async function rejects(action, marker) {
  await assert.rejects(action, new RegExp(marker));
  checks++;
}
/** 使用当前任务行构造生产 RPC 的旧字段基准。 */
async function guard(id) {
  const row = (
    await asUser(owner, 'select to_jsonb(t) as data from tasks t where id=$1', [id])
  ).rows[0].data;
  return Object.fromEntries(
    [
      'status',
      'scheduled_date',
      'deleted_at',
      'project_id',
      'actual_duration_minutes',
      'completed',
    ].map((key) => [key, row[key]]),
  );
}
try {
  await db.exec(`create schema auth; create schema private; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create extension pgcrypto with schema extensions; create publication supabase_realtime;`);
  await db.query('insert into auth.users values($1),($2)', [owner, other]);
  const folder = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(folder))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL(file, folder), 'utf8'));
  await asUser(owner, 'select initialize_workspace()');
  await asUser(other, 'select initialize_workspace()');
  const project = (await asUser(owner, 'select id from projects where is_fallback'))
    .rows[0].id;
  const ids = Array.from({ length: 7 }, () => crypto.randomUUID());
  for (const id of ids)
    await asUser(
      owner,
      "insert into tasks(id,project_id,title,status,scheduled_date) values($1,$2,'计时','active','2026-10-15')",
      [id, project],
    );
  const start = Date.parse('2026-10-15T14:00Z');
  const requests = [];
  for (let i = 0; i < 3; i++) {
    const recording = {
      id: crypto.randomUUID(),
      timezone: 'UTC',
      intervals: [{ start: start + i * 30 * 60000, end: start + 90 * 60000 }],
    };
    const params = [
      ids[i],
      90 - 30 * i,
      '2026-10-15',
      JSON.stringify(await guard(ids[i])),
      JSON.stringify(recording),
    ];
    requests.push(params);
    await asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', params);
  }
  const stats = (
    await asUser(
      owner,
      'select task_id, sum(minutes)::float as minutes from task_time_statistics group by task_id',
    )
  ).rows;
  check(
    ids
      .slice(0, 3)
      .map((id) => stats.find((r) => r.task_id === id).minutes)
      .join(',') === '55,25,10',
    'three staggered tasks allocate 55/25/10',
  );
  check(
    (await asUser(owner, 'select sum(minutes)::int as n from task_time_entries'))
      .rows[0].n === 180,
    'raw ledger remains 180',
  );
  await asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', requests[0]);
  check(
    (await asUser(owner, 'select count(*)::int as n from task_timer_records')).rows[0]
      .n === 3,
    'unknown response retry is idempotent',
  );
  await rejects(
    () => asUser(other, 'select record_task_timer($1,$2,$3,$4,$5)', requests[0]),
    'TIMER_REQUEST_REUSED',
  );
  await rejects(
    () => asUser(null, 'select record_task_timer($1,$2,$3,$4,$5)', requests[0]),
    'permission denied',
  );
  check(
    (await asUser(other, 'select * from task_time_statistics')).rows.length === 0,
    'statistics RLS isolates owners',
  );
  await rejects(
    () => asUser(owner, 'delete from task_timer_records'),
    'permission denied',
  );
  await rejects(
    () =>
      asUser(owner, 'update tasks set actual_duration_minutes=1 where id=$1', [ids[0]]),
    'TASK_ACTUAL_BELOW_TIMER_RECORDS',
  );
  check(
    (await guard(ids[0])).actual_duration_minutes === 90,
    'failed reduction preserves raw task and ledger',
  );
  const altered = [...requests[0]];
  altered[4] = JSON.stringify({ ...JSON.parse(altered[4]), timezone: 'Asia/Shanghai' });
  await rejects(
    () => asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', altered),
    'TIMER_REQUEST_REUSED',
  );
  const invalid = [
    ids[3],
    10,
    '2026-10-15',
    JSON.stringify(await guard(ids[3])),
    JSON.stringify({
      id: crypto.randomUUID(),
      timezone: 'UTC',
      intervals: [
        { start, end: start + 60000 },
        { start, end: start + 60000 },
      ],
    }),
  ];
  await rejects(
    () => asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', invalid),
    'INVALID_TIMER_INTERVAL',
  );
  check(
    (await guard(ids[3])).actual_duration_minutes === null,
    'invalid interval does not partially complete Task',
  );
  // 第二台设备再次记录同一任务；原始分钟增加，统计不重复占份额。
  await asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', [
    ids[0],
    180,
    '2026-10-15',
    JSON.stringify(await guard(ids[0])),
    JSON.stringify({
      id: crypto.randomUUID(),
      timezone: 'UTC',
      intervals: [{ start, end: start + 90 * 60000 }],
    }),
  ]);
  check(
    (await asUser(owner, 'select sum(minutes)::float as n from task_time_statistics'))
      .rows[0].n === 90,
    'same task across devices remains one share',
  );
  // 未知补录按原值加入；日期/项目筛选发生在全局分配之后。
  await asUser(owner, 'update tasks set actual_duration_minutes=12 where id=$1', [
    ids[3],
  ]);
  check(
    (await asUser(owner, 'select sum(minutes)::float as n from task_time_statistics'))
      .rows[0].n === 102,
    'manual unlocated minutes remain additive',
  );
  // 跨午夜按会话时区拆分，但旧账本归属日期不被重写。
  await asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', [
    ids[4],
    60,
    '2026-10-14',
    JSON.stringify(await guard(ids[4])),
    JSON.stringify({
      id: crypto.randomUUID(),
      timezone: 'UTC',
      intervals: [
        {
          start: Date.parse('2026-10-14T23:30Z'),
          end: Date.parse('2026-10-15T00:30Z'),
        },
      ],
    }),
  ]);
  const midnight = (
    await asUser(
      owner,
      'select entry_date::text, sum(minutes)::float as n from task_time_statistics where task_id=$1 group by entry_date order by entry_date',
      [ids[4]],
    )
  ).rows;
  check(
    midnight.map((r) => r.n).join(',') === '30,30',
    'cross-midnight allocation uses actual days',
  );
  // 原任务清理后 raw 与 allocated 两套记录均保留；ledger_id 防止空 task_id 交叉匹配。
  await db.query('delete from tasks where id=$1', [ids[4]]);
  check(
    (await asUser(owner, 'select sum(minutes)::float as n from task_time_statistics'))
      .rows[0].n === 162,
    'purge retains accounting without double-counting orphan records',
  );
  // 新关账采用分配值，已有快照不被追加会话改写。
  await asUser(
    owner,
    "insert into daily_close_records(close_date,project_minutes) values('2026-10-15','{}')",
  );
  const close = (
    await asUser(
      owner,
      "select project_minutes from daily_close_records where close_date='2026-10-15'",
    )
  ).rows[0];
  check(
    Number(close.project_minutes[project]) === 132,
    'close snapshot uses allocated totals',
  );
  // 新会话使用旧累计基准仍安全追加，并且不会回写已经冻结的收尾快照。
  const stale = JSON.parse(requests[1][3]);
  const extra = {
    id: crypto.randomUUID(),
    timezone: 'UTC',
    intervals: [{ start: start + 120 * 60000, end: start + 130 * 60000 }],
  };
  await asUser(owner, 'select record_task_timer($1,$2,$3,$4,$5)', [
    ids[1],
    10,
    '2026-10-15',
    JSON.stringify(stale),
    JSON.stringify(extra),
  ]);
  check(
    (await guard(ids[1])).actual_duration_minutes === 70,
    'stale device adds session without overwriting prior 60 raw minutes',
  );
  check(
    (
      await asUser(
        owner,
        "select project_minutes from daily_close_records where close_date='2026-10-15'",
      )
    ).rows[0].project_minutes[project] === close.project_minutes[project],
    'saved close snapshot remains unchanged',
  );
  await rejects(
    () => asUser(null, 'select * from task_time_statistics'),
    'permission denied',
  );
  await rejects(
    () =>
      asUser(owner, 'insert into task_timer_records(id) values($1)', [
        crypto.randomUUID(),
      ]),
    'permission denied',
  );
  const badOwner = [
    ids[5],
    1,
    '2026-10-15',
    JSON.stringify(await guard(ids[5])),
    JSON.stringify({
      id: crypto.randomUUID(),
      timezone: 'UTC',
      intervals: [{ start, end: start + 60000 }],
    }),
  ];
  await rejects(
    () => asUser(other, 'select record_task_timer($1,$2,$3,$4,$5)', badOwner),
    'TASK_NOT_FOUND',
  );
  console.log(`Timer accounting PostgreSQL: ${checks} checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
