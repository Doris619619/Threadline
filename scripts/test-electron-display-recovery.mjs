/** @fileoverview 用真实 BrowserWindow 和隔离的 screen 替身验证跨屏松手及工作区缩小恢复。 */
import assert from 'node:assert/strict';

/** 不改宿主机显示设置；仅在测试 Electron 进程内模拟小屏，并在 finally 恢复所有 screen 方法。 */
export async function testElectronDisplayRecovery(application) {
  const result = await application.evaluate(async ({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().includes('role=main'),
    );
    const original = {
      matching: screen.getDisplayMatching,
      nearest: screen.getDisplayNearestPoint,
      all: screen.getAllDisplays,
      bounds: window.getBounds(),
    };
    const real = screen.getDisplayMatching(original.bounds);
    const area = { x: real.workArea.x, y: real.workArea.y, width: 820, height: 580 };
    const target = { ...real, id: real.id + 1000, scaleFactor: 2, workArea: area };
    /** 轮询窗口夹取结果；内容尺寸避免 Windows 无框外边缘舍入影响。 */
    const waitForFit = async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const { x, y } = window.getBounds();
        const [width, height] = window.getContentSize();
        if (
          x >= area.x &&
          y >= area.y &&
          x + width <= area.x + area.width + 1 &&
          y + height <= area.y + area.height + 1
        )
          return { x, y, width, height };
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Cross-display recovery did not fit the target work area');
    };
    try {
      // 原生状态切换有 320ms 抑制期；模拟用户随后完成一次跨屏拖动。
      await new Promise((resolve) => setTimeout(resolve, 400));
      screen.getDisplayMatching = () => real;
      screen.getDisplayNearestPoint = () => target;
      window.setBounds({ x: area.x - 160, y: area.y + 20, width: 1100, height: 760 });
      window.emit('moved');
      const moved = await waitForFit();
      await new Promise((resolve) => setTimeout(resolve, 400));
      screen.getAllDisplays = () => [target];
      screen.getDisplayMatching = () => target;
      window.setBounds({ x: area.x - 120, y: area.y, width: 1000, height: 700 });
      screen.emit('display-metrics-changed', {}, target, ['workArea', 'scaleFactor']);
      const metrics = await waitForFit();
      return { moved, metrics };
    } finally {
      screen.getDisplayMatching = original.matching;
      screen.getDisplayNearestPoint = original.nearest;
      screen.getAllDisplays = original.all;
      window.setBounds(original.bounds);
      screen.emit('display-metrics-changed', {}, real, ['workArea']);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  });
  assert.equal(
    result.moved.width,
    820,
    'completed drag must use the cursor target display',
  );
  assert.equal(
    result.metrics.height,
    580,
    'work area changes must recover current native geometry',
  );
}
