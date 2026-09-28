/** @fileoverview 仅监听 loopback 的 PostgreSQL 预览桥；固定四个测试身份，不提供任意 SQL/正式账号入口。 */
import { createServer } from 'node:http';
import { createDatabase, asUser, command, seedPreview, users } from './database.mjs';
const db = await createDatabase();
await seedPreview(db);
/** 严格白名单 SQL 标识符；所有用户值均以绑定参数传递。 */
function identifier(value) {
  if (!/^[a-z_]+$/.test(value)) throw new Error('Invalid identifier');
  return `"${value}"`;
}
/** JSON 响应使用不缓存和固定 localhost CORS，不允许外站调用测试身份。 */
function send(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(value));
}
const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !['http://localhost:3100', 'http://127.0.0.1:3100'].includes(origin))
    return send(response, 403, { message: 'Local preview only' });
  const cors = {
    'Access-Control-Allow-Origin': origin ?? 'http://localhost:3100',
    'Access-Control-Allow-Headers':
      'authorization,apikey,content-type,x-client-info,x-preview-user,prefer,accept-profile,content-profile,range,range-unit',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
  };
  if (request.method === 'OPTIONS') return send(response, 200, {}, cors);
  if (request.url === '/health' && request.method === 'GET')
    return send(response, 200, { ready: true }, cors);
  const user = request.headers['x-preview-user'];
  if (!users.includes(user))
    return send(response, 401, { message: 'Preview identity required' }, cors);
  try {
    const url = new URL(request.url, 'http://127.0.0.1:3102');
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      if (request.method !== 'POST') throw new Error('POST required');
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16384) throw new Error('Request too large');
      }
      const p = JSON.parse(body);
      let result;
      if (url.pathname.endsWith('/together_command'))
        result = await command(db, user, p.p_action, p.p_payload, p.p_request_id);
      else if (url.pathname.endsWith('/together_preview_invite'))
        result = (
          await asUser(db, user, 'select together_preview_invite($1) as result', [
            p.p_code,
          ])
        ).rows[0].result;
      else throw new Error('Unsupported preview RPC');
      return send(response, 200, result, cors);
    }
    if (!['GET', 'HEAD'].includes(request.method)) throw new Error('Read only REST');
    const table = url.pathname.split('/').at(-1);
    if (
      ![
        'together_profiles',
        'together_rooms',
        'together_memberships',
        'together_invites',
        'together_flags',
        'together_events',
        'together_requests',
      ].includes(table)
    )
      throw new Error('Unsupported preview table');
    const select = url.searchParams.get('select') ?? '*';
    const columns = select === '*' ? '*' : select.split(',').map(identifier).join(',');
    const values = [];
    const conditions = [];
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const col = identifier(key);
      const dot = value.indexOf('.');
      const op = value.slice(0, dot),
        operand = value.slice(dot + 1);
      if (op === 'is' && operand === 'null') conditions.push(`${col} is null`);
      else if (op === 'in') {
        const list = operand.slice(1, -1).split(',');
        conditions.push(
          `${col} in (${list
            .map((v) => {
              values.push(v);
              return '$' + values.length;
            })
            .join(',')})`,
        );
      } else {
        const sqlOp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[
          op
        ];
        if (!sqlOp) throw new Error('Invalid filter');
        values.push(operand);
        conditions.push(`${col}${sqlOp}$${values.length}`);
      }
    }
    const where = conditions.length ? ' where ' + conditions.join(' and ') : '';
    const count = (
      await asUser(
        db,
        user,
        `select count(*)::integer as count from ${identifier(table)}${where}`,
        values,
      )
    ).rows[0].count;
    let order = '';
    if (url.searchParams.has('order'))
      order =
        ' order by ' +
        url.searchParams
          .get('order')
          .split(',')
          .map((v) => {
            const [col, dir] = v.split('.');
            return identifier(col) + (dir === 'desc' ? ' desc' : ' asc');
          })
          .join(',');
    const limit = Math.min(
      1000,
      Math.max(0, Number(url.searchParams.get('limit') ?? 1000)),
    );
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
    if (!Number.isInteger(limit) || !Number.isInteger(offset))
      throw new Error('Invalid page');
    const rows = (
      await asUser(
        db,
        user,
        `select ${columns} from ${identifier(table)}${where}${order} limit ${limit} offset ${offset}`,
        values,
      )
    ).rows;
    const single = String(request.headers.accept).includes('vnd.pgrst.object');
    if (single && rows.length !== 1)
      return send(
        response,
        406,
        {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
          details: `The result contains ${rows.length} rows`,
        },
        cors,
      );
    return send(response, 200, single ? rows[0] : rows, {
      ...cors,
      'Content-Range': `${offset}-${offset + Math.max(rows.length - 1, 0)}/${count}`,
    });
  } catch (error) {
    send(
      response,
      400,
      { message: error.message, code: error.code ?? 'PREVIEW' },
      cors,
    );
  }
});
server.listen(3102, '127.0.0.1', () =>
  console.log(
    'Together preview database: http://127.0.0.1:3102 (ephemeral local PostgreSQL, no production connection).',
  ),
);
/** 退出时释放内存数据库；重启得到干净的测试场景。 */
async function stop() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
