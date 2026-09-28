/** @fileoverview PGlite 测试夹具：执行原始两人空间迁移，模拟 Auth UID 与普通角色；不连接生产。 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile } from 'node:fs/promises';
export const users = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];
/** 新建内存数据库并完整执行仓库迁移；只模拟 Supabase 提供的基础身份环境。 */
export async function createDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema auth; create schema private; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create extension pgcrypto with schema extensions;
    create publication supabase_realtime;`);
  for (const id of users) await db.query('insert into auth.users values($1)', [id]);
  await db.exec(
    await readFile(
      new URL('../../supabase/migrations/202609280001_together.sql', import.meta.url),
      'utf8',
    ),
  );
  return db;
}
/** 每次操作用独立事务设置本地会话身份，回滚后不污染下一用户。 */
export async function asUser(db, user, query, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    return tx.query(query, params);
  });
}
/** 通过公开 RPC 执行业务操作，保持与浏览器相同的参数和权限。 */
export async function command(
  db,
  user,
  action,
  payload,
  request = crypto.randomUUID(),
) {
  const result = await asUser(
    db,
    user,
    'select public.together_command($1,$2,$3) as result',
    [request, action, JSON.stringify(payload)],
  );
  return result.rows[0].result;
}
/** localhost 展示种子：一对情侣、已提交/进行中/完成三种状态，均来自实际 RPC。 */
export async function seedPreview(db) {
  const [a, b] = users;
  await command(db, a, 'profile', { name: '小桃' });
  await command(db, b, 'profile', { name: '小熊' });
  const invite = await command(db, a, 'invite', { relationship: 'couple' });
  let room = await command(db, b, 'accept_invite', { id: invite.id });
  const draft = {
    room_id: room.id,
    title: '背完雅思 Unit 3，完成一次默写',
    description: '默写正确率达到 90%，订正后把照片发到微信。',
    reward: '一小块喜欢的蛋糕',
    deadline: new Date(Date.now() + 3600000 * 4).toISOString(),
    timezone: 'Asia/Shanghai',
  };
  const f1 = (await command(db, a, 'create_flag', draft)).flag;
  const f2 = (
    await command(db, b, 'create_flag', {
      ...draft,
      title: '读完那本书的第三章',
      description: '记下三个喜欢的句子，微信分享。',
      reward: '一杯热可可',
    })
  ).flag;
  await command(db, b, 'submit', {
    room_id: room.id,
    flag_id: f2.id,
    version: f2.version,
    wechat_sent: true,
    body: '三个句子已经发给你啦。',
  });
  const f3 = (
    await command(db, a, 'create_flag', {
      ...draft,
      title: '认真跑完今天的三公里',
      reward: '好好休息一个晚上',
    })
  ).flag;
  const submitted = (
    await command(db, a, 'submit', {
      room_id: room.id,
      flag_id: f3.id,
      version: f3.version,
      wechat_sent: true,
      body: '跑步记录发到微信了。',
    })
  ).flag;
  const approved = (
    await command(db, b, 'approve', {
      room_id: room.id,
      flag_id: f3.id,
      version: submitted.version,
      body: '说到做到的小桃，今天也很厉害。',
    })
  ).flag;
  await command(db, b, 'surprise', {
    room_id: room.id,
    flag_id: f3.id,
    version: approved.version,
    body: '奖励是今天的晚霞，照片已经发到微信啦。',
  });
  room = (await db.query('select * from together_rooms where id=$1', [room.id]))
    .rows[0];
  return { room, flag: f1 };
}
