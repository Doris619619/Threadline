/** @fileoverview 初始化 DOM 断言；补齐 JSDOM 未实现的浮层与尺寸观察 API，真实布局由浏览器 E2E 验证。 */
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
