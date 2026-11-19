/** @fileoverview 校验本地测试端口并检查 loopback 独占绑定，避免测试误用其它任务正在运行的服务。 */
import { createServer } from 'node:net';

/** 端口变量必须是 1–65535 的十进制整数；缺省使用原端口，显式空值不视为默认配置。 */
export function resolveTestServerPort(name, fallback, environment = process.env) {
  const value = environment[name] ?? String(fallback);
  if (
    !/^\d+$/.test(value) ||
    !Number.isInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > 65535
  )
    throw new Error(
      `${name} must be an integer from 1 to 65535; received ${JSON.stringify(value)}.`,
    );
  return Number(value);
}

/** 实际试绑定 loopback 端口并释放检查 socket；占用时明确失败，绝不终止或复用已有服务。 */
export async function assertTestServerPortAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', (cause) => {
      reject(
        cause.code === 'EADDRINUSE'
          ? new Error(
              `Refusing to start the test server: 127.0.0.1:${port} is already in use. Choose another test port; the existing service was left running.`,
              { cause },
            )
          : cause,
      );
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}
