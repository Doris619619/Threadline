/** @fileoverview 在真实 PostgreSQL 引擎执行两人空间 SQL/RLS/幂等与状态机；不模拟业务结果。 */
import assert from 'node:assert/strict';
import { createDatabase, asUser, command, users } from './together/database.mjs';
const db = await createDatabase();
const [a, b, c, d] = users;
let checks = 0;
/** 成功断言计入可汇报检查总数。 */
function check(value, message) {
  assert.ok(value, message);
  checks++;
}
/** 拒绝路径必须由数据库实际返回，不能仅检查客户端按钮。 */
async function rejects(fn, marker) {
  await assert.rejects(fn, new RegExp(marker));
  checks++;
}
try {
  await rejects(
    () => command(db, null, 'profile', { name: '匿名' }),
    'permission denied',
  );
  for (const [i, user] of users.entries())
    await command(db, user, 'profile', { name: `成员${i + 1}` });
  const invitation = await command(db, a, 'invite', { relationship: 'couple' });
  await rejects(
    () => asUser(db, a, 'select together_preview_invite($1)', [invitation.code]),
    'INVITE_SELF',
  );
  const preview = (
    await asUser(db, b, 'select together_preview_invite($1) as result', [
      invitation.code,
    ])
  ).rows[0].result;
  check(
    preview.name === '成员1' && !JSON.stringify(preview).includes('@'),
    'invite preview has only display name',
  );
  const request = crypto.randomUUID();
  const room = await command(db, b, 'accept_invite', { id: invitation.id }, request);
  check(
    (await command(db, b, 'accept_invite', { id: invitation.id }, request)).id ===
      room.id,
    'binding retry is idempotent',
  );
  await rejects(
    () => command(db, b, 'profile', { name: '变更' }, request),
    'REQUEST_REUSED',
  );
  await rejects(
    () => command(db, c, 'accept_invite', { id: invitation.id }),
    'INVITE_INVALID',
  );
  await rejects(
    () => command(db, a, 'invite', { relationship: 'friends' }),
    'ALREADY_BOUND',
  );
  check(
    (await asUser(db, c, 'select * from together_rooms')).rows.length === 0,
    'third member cannot read room',
  );
  await rejects(
    () => asUser(db, a, 'update together_rooms set affection=999'),
    'permission denied',
  );
  const payload = {
    room_id: room.id,
    title: '今天背单词',
    description: '正确率 90%',
    reward: '奶茶',
    deadline: '2026-09-28T14:00:00Z',
    timezone: 'Asia/Shanghai',
  };
  let flag = (await command(db, a, 'create_flag', payload)).flag;
  flag = (
    await command(db, a, 'edit_flag', {
      ...payload,
      flag_id: flag.id,
      version: flag.version,
      timezone: 'America/New_York',
    })
  ).flag;
  check(
    flag.timezone === 'Asia/Shanghai',
    'editing in a new account timezone preserves creation zone',
  );
  check(
    (await asUser(db, b, 'select * from together_flags')).rows.length === 1,
    'partner can read flag',
  );
  check(
    (await asUser(db, c, 'select * from together_flags')).rows.length === 0,
    'third user cannot read flag',
  );
  await rejects(() => command(db, c, 'create_flag', payload), 'FORBIDDEN');
  await rejects(
    () => command(db, a, 'create_flag', { ...payload, timezone: 'Mars/Olympus' }),
    'INVALID_TIMEZONE',
  );
  await rejects(
    () => command(db, a, 'create_flag', { ...payload, title: 'x'.repeat(101) }),
    'check constraint',
  );
  const cheerId = crypto.randomUUID();
  const beforeCheer = flag.version;
  const cheer = await command(
    db,
    b,
    'cheer',
    { room_id: room.id, flag_id: flag.id, version: beforeCheer },
    cheerId,
  );
  check(cheer.points === 1, 'couple cheer adds one');
  flag = cheer.flag;
  check(
    (
      await command(
        db,
        b,
        'cheer',
        { room_id: room.id, flag_id: flag.id, version: beforeCheer },
        cheerId,
      )
    ).points === 1,
    'retry reads original result',
  );
  await rejects(
    () =>
      command(db, b, 'cheer', {
        room_id: room.id,
        flag_id: flag.id,
        version: flag.version,
      }),
    'unique constraint',
  );
  await rejects(
    () =>
      command(db, a, 'submit', {
        room_id: room.id,
        flag_id: flag.id,
        version: flag.version,
        wechat_sent: false,
      }),
    'WECHAT_REQUIRED',
  );
  await rejects(
    () =>
      command(db, b, 'submit', {
        room_id: room.id,
        flag_id: flag.id,
        version: flag.version,
        wechat_sent: true,
      }),
    'FORBIDDEN',
  );
  flag = (
    await command(db, a, 'submit', {
      room_id: room.id,
      flag_id: flag.id,
      version: flag.version,
      wechat_sent: true,
      body: '微信已发送',
    })
  ).flag;
  const first = flag.first_submitted_at;
  await rejects(
    () =>
      command(db, a, 'approve', {
        room_id: room.id,
        flag_id: flag.id,
        version: flag.version,
      }),
    'SELF_REVIEW',
  );
  await rejects(
    () =>
      command(db, a, 'edit_flag', {
        ...payload,
        flag_id: flag.id,
        version: flag.version,
      }),
    'FLAG_LOCKED',
  );
  await rejects(
    () =>
      command(db, b, 'changes', {
        room_id: room.id,
        flag_id: flag.id,
        version: flag.version,
        body: '',
      }),
    'REASON_REQUIRED',
  );
  flag = (
    await command(db, b, 'changes', {
      room_id: room.id,
      flag_id: flag.id,
      version: flag.version,
      body: '补一下订正',
    })
  ).flag;
  flag = (
    await command(db, a, 'submit', {
      room_id: room.id,
      flag_id: flag.id,
      version: flag.version,
      wechat_sent: true,
      body: '订正也发了',
    })
  ).flag;
  check(first === flag.first_submitted_at, 'supplement preserves first submission');
  const staleVersion = flag.version;
  flag = (
    await command(db, b, 'approve', {
      room_id: room.id,
      flag_id: flag.id,
      version: flag.version,
      body: '真的很棒',
    })
  ).flag;
  await rejects(
    () =>
      command(db, b, 'changes', {
        room_id: room.id,
        flag_id: flag.id,
        version: staleVersion,
        body: '迟到操作',
      }),
    'VERSION_CONFLICT',
  );
  await command(db, b, 'surprise', {
    room_id: room.id,
    flag_id: flag.id,
    version: flag.version,
    body: '照片发微信啦',
  });
  let current = (
    await asUser(db, a, 'select * from together_rooms where id=$1', [room.id])
  ).rows[0];
  check(current.affection === 3, 'single flag maximum three points');
  current = await command(db, a, 'propose_relationship', {
    room_id: room.id,
    version: current.version,
    relationship: 'friends',
  });
  await rejects(
    () =>
      command(db, a, 'answer_relationship', {
        room_id: room.id,
        version: current.version,
        accept: true,
      }),
    'FORBIDDEN',
  );
  current = await command(db, b, 'answer_relationship', {
    room_id: room.id,
    version: current.version,
    accept: true,
  });
  const friendFlag = (await command(db, b, 'create_flag', payload)).flag;
  const friendCheer = await command(db, a, 'cheer', {
    room_id: room.id,
    flag_id: friendFlag.id,
    version: friendFlag.version,
  });
  check(friendCheer.points === 0, 'friends do not accumulate affection');
  current = (await asUser(db, a, 'select * from together_rooms where id=$1', [room.id]))
    .rows[0];
  await command(db, a, 'end_room', { room_id: room.id, version: current.version });
  check(
    (await asUser(db, b, 'select * from together_rooms')).rows.length === 1,
    'original partner can read old history',
  );
  check(
    (
      await asUser(db, b, 'select status from together_flags where id=$1', [
        friendFlag.id,
      ])
    ).rows[0].status === 'cancelled',
    'ending cancels unfinished flags',
  );
  await rejects(() => command(db, b, 'create_flag', payload), 'ROOM_ENDED');
  const next = await command(db, c, 'invite', { relationship: 'friends' });
  await command(db, a, 'accept_invite', { id: next.id });
  check(
    (await asUser(db, c, 'select * from together_flags')).rows.length === 0,
    'new partner cannot see past flags',
  );
  const exp = await command(db, d, 'invite', { relationship: 'friends' });
  await db.query(
    "update together_invites set expires_at=now()-interval '1 second' where id=$1",
    [exp.id],
  );
  await rejects(
    () => asUser(db, b, 'select together_preview_invite($1)', [exp.code]),
    'INVITE_INVALID',
  );
  const revoked = await command(db, d, 'invite', { relationship: 'friends' });
  await command(db, d, 'revoke_invite', { id: revoked.id });
  await rejects(
    () => asUser(db, b, 'select together_preview_invite($1)', [revoked.code]),
    'INVITE_INVALID',
  );
  console.log(
    `Together PostgreSQL: ${checks} checks passed (original migration, RLS, RPC, idempotency, lifecycle).`,
  );
} finally {
  await db.close();
}
