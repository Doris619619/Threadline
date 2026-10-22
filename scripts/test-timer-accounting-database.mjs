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
async function guard(id, user = owner) {
  const row = (
    await asUser(user, 'select to_jsonb(t) as data from tasks t where id=$1', [id])
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
/** 每个复杂时段场景建立独立账号，避免其他测试会话参与该账号的全局分摊。 */
async function timerFixture() {
  const user = crypto.randomUUID();
  await db.query('insert into auth.users values($1)', [user]);
  await asUser(user, 'select initialize_workspace()');
  const project = (await asUser(user, 'select id from projects where is_fallback'))
    .rows[0].id;
  return { user, project };
}
/** 创建可经正式 RPC 完成的任务；会话日期与原始分钟仍使用任务启动日。 */
async function timerTask(fixture, date) {
  const id = crypto.randomUUID();
  await asUser(
    fixture.user,
    "insert into tasks(id,project_id,title,status,scheduled_date) values($1,$2,'复杂计时','active',$3)",
    [id, fixture.project, date],
  );
  return id;
}
/** 按原始运行区间构造真实生产请求并返回它，调用者可复用相同 ID 验证未知结果重试。 */
async function saveTimer(fixture, task, date, timezone, intervals) {
  const expected = await guard(task, fixture.user);
  const raw = Math.round(
    intervals.reduce((sum, part) => sum + part.end - part.start, 0) / 60000,
  );
  const request = [
    task,
    (expected.actual_duration_minutes ?? 0) + raw,
    date,
    JSON.stringify(expected),
    JSON.stringify({ id: crypto.randomUUID(), timezone, intervals }),
  ];
  await asUser(fixture.user, 'select record_task_timer($1,$2,$3,$4,$5)', request);
  return request;
}
/** 查询真实分配投影，排除仅承载原始核对值的零分钟余额行，以验证自然日和小数分钟。 */
async function allocatedDays(fixture, task) {
  return (
    await asUser(
      fixture.user,
      "select entry_date::text as date, sum(minutes)::float as minutes from task_time_statistics where task_id=$1 and timing='allocated' group by entry_date order by entry_date",
      [task],
    )
  ).rows;
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
  // Daily 没有项目归属，正常日常条目不能使项目快照以空 JSON 键写入失败。
  await asUser(owner, 'select create_daily_template_with_entry($1,$2,$3,$4)', [
    crypto.randomUUID(),
    '独立 Daily',
    '[]',
    '2026-10-15',
  ]);
  check(
    (
      await asUser(
        owner,
        "select count(*)::int as n from daily_entries where project_id is null and entry_date='2026-10-15'",
      )
    ).rows[0].n > 0,
    'daily fixture has no project, matching production schema',
  );
  // 新关账采用分配值，保留 Daily 独立统计，已有快照不被追加会话改写。
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

  const calendarCases = [
    {
      name: 'Havana first repeated midnight retains all 30 minutes',
      timezone: 'America/Havana',
      date: '2025-11-02',
      start: '2025-11-02T04:15Z',
      end: '2025-11-02T04:45Z',
      expected: [{ date: '2025-11-02', minutes: 30 }],
    },
    {
      name: 'Havana repeated midnight belongs to the new local date from its first occurrence',
      timezone: 'America/Havana',
      date: '2025-11-01',
      start: '2025-11-02T03:30Z',
      end: '2025-11-02T05:30Z',
      expected: [
        { date: '2025-11-01', minutes: 30 },
        { date: '2025-11-02', minutes: 90 },
      ],
    },
    {
      name: 'Havana both repeated midnight hours count once each',
      timezone: 'America/Havana',
      date: '2025-11-02',
      start: '2025-11-02T04:00Z',
      end: '2025-11-02T06:00Z',
      expected: [{ date: '2025-11-02', minutes: 120 }],
    },
    {
      name: 'ordinary New York midnight preserves a 30/30 split',
      timezone: 'America/New_York',
      date: '2026-10-13',
      start: '2026-10-14T03:30Z',
      end: '2026-10-14T04:30Z',
      expected: [
        { date: '2026-10-13', minutes: 30 },
        { date: '2026-10-14', minutes: 30 },
      ],
    },
    {
      name: 'New York spring day contains 23 real hours',
      timezone: 'America/New_York',
      date: '2025-03-09',
      start: '2025-03-09T05:00Z',
      end: '2025-03-10T04:00Z',
      expected: [{ date: '2025-03-09', minutes: 23 * 60 }],
    },
    {
      name: 'New York autumn day contains 25 real hours',
      timezone: 'America/New_York',
      date: '2025-11-02',
      start: '2025-11-02T04:00Z',
      end: '2025-11-03T05:00Z',
      expected: [{ date: '2025-11-02', minutes: 25 * 60 }],
    },
    {
      name: 'Santiago skipped midnight starts at its first valid local instant',
      timezone: 'America/Santiago',
      date: '2025-09-06',
      start: '2025-09-07T03:30Z',
      end: '2025-09-07T04:30Z',
      expected: [
        { date: '2025-09-06', minutes: 30 },
        { date: '2025-09-07', minutes: 30 },
      ],
    },
    {
      name: 'Apia skipped calendar date creates no phantom day or lost minutes',
      timezone: 'Pacific/Apia',
      date: '2011-12-29',
      start: '2011-12-30T09:30Z',
      end: '2011-12-30T10:30Z',
      expected: [
        { date: '2011-12-29', minutes: 30 },
        { date: '2011-12-31', minutes: 30 },
      ],
    },
  ];
  for (const scenario of calendarCases) {
    const fixture = await timerFixture();
    const task = await timerTask(fixture, scenario.date);
    await saveTimer(fixture, task, scenario.date, scenario.timezone, [
      { start: Date.parse(scenario.start), end: Date.parse(scenario.end) },
    ]);
    check(
      JSON.stringify(await allocatedDays(fixture, task)) ===
        JSON.stringify(scenario.expected),
      scenario.name,
    );
    check(
      (await guard(task, fixture.user)).actual_duration_minutes ===
        scenario.expected.reduce((sum, day) => sum + day.minutes, 0),
      scenario.name + ': raw cumulative minutes remain intact',
    );
  }

  // 三任务交错暂停与等待续时，六种保存顺序都必须得到同一份 42.5/27.5/20 分钟投影。
  for (const order of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const fixture = await timerFixture();
    const taskIds = [];
    for (let i = 0; i < 3; i++) taskIds.push(await timerTask(fixture, '2026-10-15'));
    const spans = [
      [
        [0, 30],
        [45, 90],
      ],
      [[0, 60]],
      [
        [15, 45],
        [75, 90],
      ],
    ];
    const savedRequests = [];
    for (const i of order)
      savedRequests.push(
        await saveTimer(
          fixture,
          taskIds[i],
          '2026-10-15',
          'UTC',
          spans[i].map(([from, to]) => ({
            start: start + from * 60000,
            end: start + to * 60000,
          })),
        ),
      );
    const projection = (
      await asUser(
        fixture.user,
        'select task_id, sum(minutes)::float as minutes from task_time_statistics group by task_id',
      )
    ).rows;
    check(
      taskIds
        .map((id) => projection.find((row) => row.task_id === id).minutes)
        .join(',') === '42.5,27.5,20',
      'interleaved pauses allocate the same shares for save order ' + order.join(''),
    );
    check(
      projection.reduce((sum, row) => sum + row.minutes, 0) === 90,
      'pauses and countdown waiting gaps do not inflate the 90-minute union',
    );
    const raw = (
      await asUser(fixture.user, 'select id, actual_duration_minutes from tasks')
    ).rows;
    check(
      taskIds
        .map((id) => raw.find((row) => row.id === id).actual_duration_minutes)
        .join(',') === '75,60,45',
      'per-task raw minutes retain their own running intervals',
    );
    await asUser(
      fixture.user,
      'select record_task_timer($1,$2,$3,$4,$5)',
      savedRequests[0],
    );
    check(
      (await asUser(fixture.user, 'select count(*)::int as n from task_timer_records'))
        .rows[0].n === 3,
      'retry after the other two saves does not duplicate the first session',
    );
  }
  check(
    (
      await db.query(
        "select reloptions from pg_class where oid='public.task_time_statistics'::regclass",
      )
    ).rows[0].reloptions.includes('security_invoker=true'),
    'replacement statistics view retains security-invoker RLS',
  );
  check(
    (await asUser(other, 'select * from task_time_statistics')).rows.length === 0,
    'replacement view keeps every complex fixture isolated from another account',
  );
  console.log(`Timer accounting PostgreSQL: ${checks} checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
