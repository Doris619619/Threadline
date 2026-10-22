/** @fileoverview 初始化 DOM 断言与 JSDOM 缺失的浮层、观察器和独占锁；跨标签锁另由真实浏览器 E2E 验证。 */
import '@testing-library/jest-dom/vitest';

Object.defineProperties(HTMLElement.prototype, {
  showPopover: {
    configurable: true,
    value(this: HTMLElement) {
      this.style.display = 'block';
    },
  },
  hidePopover: {
    configurable: true,
    value(this: HTMLElement) {
      this.style.display = 'none';
    },
  },
});

/** JSDOM 没有布局引擎；单元测试只需观察器生命周期，定位另有 Chrome/WebKit 覆盖。 */
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = TestResizeObserver;

const lockTails = new Map<string, Promise<unknown>>();
/** 模拟 Web Locks 按名称排队和失败释放；此处不替代真实多标签浏览器验收。 */
function requestTestLock<T>(
  name: string,
  callback: (lock: Lock) => T | PromiseLike<T>,
) {
  const current = (lockTails.get(name) ?? Promise.resolve()).then(() =>
    callback({ name, mode: 'exclusive' } as Lock),
  );
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  lockTails.set(name, tail);
  void tail.then(() => {
    if (lockTails.get(name) === tail) lockTails.delete(name);
  });
  return current;
}
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: { request: requestTestLock },
});
