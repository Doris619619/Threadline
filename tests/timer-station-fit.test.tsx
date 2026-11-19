/** @fileoverview 验证计时站测量只发布可用的最终适配模式，最小窗重复测量不会短暂缩小控件。 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTimerStationFit } from '@/features/tasks/hooks/use-timer-station-fit';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 挂载真实 hook 的两处 DOM 引用；布局读数由测试视口提供，不替换 fit 实现。 */
function StationFitHarness() {
  const { viewportRef, canvasRef } = useTimerStationFit(3, 'horizontal');
  return (
    <section ref={viewportRef} data-testid="viewport">
      <div ref={canvasRef}>三张计时卡片</div>
    </section>
  );
}

it.each([68, 275])(
  'never publishes scaled mode during repeated measurement of a 200 by %s viewport',
  (height) => {
    let resized!: ResizeObserverCallback;
    /** 保留真实测量回调，允许同步触发下一次 resize，不让计时/动画调度影响模式断言。 */
    class ResizeProbe {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeProbe);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(144);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const view = render(<StationFitHarness />);
    const viewport = view.getByTestId('viewport');
    expect(viewport).toHaveAttribute('data-fit', 'scroll');
    const observer = new MutationObserver(() => {});
    observer.observe(viewport, {
      attributes: true,
      attributeFilter: ['data-fit'],
      attributeOldValue: true,
    });
    act(() => resized([], {} as ResizeObserver));
    const previousModes = observer.takeRecords().map((record) => record.oldValue);
    observer.disconnect();
    expect(viewport).toHaveAttribute('data-fit', 'scroll');
    expect(previousModes).not.toContain('scale');
  },
);
