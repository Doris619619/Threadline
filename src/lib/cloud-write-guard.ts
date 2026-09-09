/** @fileoverview 跟踪已排队和执行中的云写入，在用户发起更新重启时阻止新的写入。 */
let pending = 0;
let installing = false;
const listeners = new Set<() => void>();

/** 通知 React 和更新入口重新读取写入状态。 */
function publish() {
  for (const listener of listeners) listener();
}

/** 在排队前计数；返回幂等的结束函数，失败也必须释放。 */
export function beginCloudWrite(): () => void {
  if (installing) throw new Error('正在重启更新，请稍后再保存。');
  pending++;
  publish();
  let ended = false;
  return () => {
    if (!ended) {
      ended = true;
      pending--;
      publish();
    }
  };
}

/** fetch 等待响应后仍消费原响应体，确保锁覆盖写入响应传输。 */
export async function trackedCloudFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (method === 'GET' || method === 'HEAD') return fetch(input, init);
  const end = beginCloudWrite();
  try {
    const response = await fetch(input, init);
    await response.clone().arrayBuffer();
    return response;
  } finally {
    end();
  }
}

/** 更新检查可订阅活动保存数量，不依赖 React Query 的异步批量通知。 */
export function subscribeCloudWrites(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** 返回稳定的 primitive snapshot。 */
export function getPendingCloudWrites() {
  return pending;
}
/** 仅空闲时独占重启；调用者在取消或失败时释放。 */
export function lockForDesktopUpdate() {
  if (pending || installing) throw new Error('正在保存，请保存完成后再更新。');
  installing = true;
  return () => {
    installing = false;
  };
}
