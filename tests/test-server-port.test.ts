/** @fileoverview 使用真实 Node loopback socket 验证端口校验、占用拒绝和空闲检查后的资源释放。 */
import { createConnection, createServer, type Server } from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import {
  assertTestServerPortAvailable,
  resolveTestServerPort,
} from '../scripts/test-server-port.mjs';

/** 由操作系统分配隔离临时端口，避免测试抢占任何项目固定服务。 */
async function listen(server: Server, port = 0): Promise<number> {
  server.listen({ host: '127.0.0.1', port, exclusive: true });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP address.');
  return address.port;
}

/** 等待服务完全释放 socket，供后续验证同一端口可以再次绑定。 */
async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

it('keeps default ports and accepts explicit decimal ports including the supported bounds', () => {
  expect(resolveTestServerPort('THREADLINE_PREVIEW_PORT', 3103, {})).toBe(3103);
  expect(resolveTestServerPort('THREADLINE_E2E_PORT', 3100, {})).toBe(3100);
  for (const value of ['1', '32103', '65535'])
    expect(resolveTestServerPort('PORT', 3103, { PORT: value })).toBe(Number(value));
});

it.each(['', '0', '65536', '-1', '3103.5', '1e3', '3103abc', ' 3103 ', 'NaN'])(
  'rejects invalid configured port %j instead of starting a test server',
  (value) => {
    expect(() =>
      resolveTestServerPort('THREADLINE_PREVIEW_PORT', 3103, {
        THREADLINE_PREVIEW_PORT: value,
      }),
    ).toThrow(/THREADLINE_PREVIEW_PORT must be an integer from 1 to 65535/);
  },
);

it('rejects a busy port while the original service remains reachable', async () => {
  const server = createServer((socket) => socket.end());
  const port = await listen(server);
  try {
    await expect(assertTestServerPortAvailable(port)).rejects.toThrow(
      `127.0.0.1:${port} is already in use`,
    );
    expect(server.listening).toBe(true);
    const client = createConnection({ host: '127.0.0.1', port });
    try {
      await once(client, 'connect');
    } finally {
      client.destroy();
    }
  } finally {
    await close(server);
  }
});

it('accepts a free port and releases its probe before the actual test service binds', async () => {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  await expect(assertTestServerPortAvailable(port)).resolves.toBeUndefined();
  await listen(server, port);
  await close(server);
});
