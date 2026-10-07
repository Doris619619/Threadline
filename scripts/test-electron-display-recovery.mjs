/** @fileoverview 用真实 BrowserWindow 验证实体双屏 DPI 切换，以及 screen 替身驱动的工作区恢复。 */
import assert from 'node:assert/strict';

/** 在宿主已有不同 DPI 双屏时，验证完整窗口和 200 DIP 工作站的真实跨屏 hydration，单屏环境直接跳过。 */
export async function testElectronCrossDpiRecovery(application, page) {
  const scenario = await application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().includes('role=main'),
    );
    const displays = screen
      .getAllDisplays()
      .sort((left, right) => left.scaleFactor - right.scaleFactor);
    const source = displays[0];
    const target = displays.find(
      (display) => display.scaleFactor !== source.scaleFactor,
    );
    if (!target) return undefined;
    const original = window.getBounds();
    const from = {
      x: source.workArea.x + 24,
      y: source.workArea.y + 24,
      width: Math.min(1000, source.workArea.width - 48),
      height: Math.min(700, source.workArea.height - 48),
    };
    const to = {
      x: target.workArea.x + 24,
      y: target.workArea.y + 24,
      width: 200,
      height: 111,
    };
    window.setBounds(from);
    return {
      original,
      from,
      to,
      fullTarget: {
        ...to,
        width: Math.min(1000, target.workArea.width - 48),
        height: Math.min(600, target.workArea.height - 48),
      },
      sourceScale: source.scaleFactor,
      targetScale: target.scaleFactor,
    };
  });
  if (!scenario) return;
  try {
    const fullResult = await page.evaluate(
      (geometry) =>
        window.threadlineDesktop.hydrateDesktopState({
          requestId: 998,
          mode: 'full',
          presentation: 'expanded',
          windowStates: { full: geometry },
        }),
      scenario.fullTarget,
    );
    const fullActual = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('role=main'))
        .getContentSize(),
    );
    assert.ok(
      Math.abs(fullActual[0] - scenario.fullTarget.width) <= 1 &&
        Math.abs(fullActual[1] - scenario.fullTarget.height) <= 1,
      'native full bounds keep the requested DIP dimensions after crossing DPI',
    );
    assert.equal(
      fullResult.geometry.width,
      fullActual[0],
      'full canonical width matches final native content',
    );
    await application.evaluate(
      ({ BrowserWindow }, geometry) =>
        BrowserWindow.getAllWindows()
          .find((item) => item.webContents.getURL().includes('role=main'))
          .setBounds(geometry),
      scenario.from,
    );
    const result = await page.evaluate(
      (geometry) =>
        window.threadlineDesktop.hydrateDesktopState({
          requestId: 1000,
          mode: 'workstation',
          presentation: 'expanded',
          windowStates: { workstation: geometry },
        }),
      scenario.to,
    );
    const actual = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('role=main'))
        .getContentSize(),
    );
    assert.equal(
      actual[0],
      200,
      `native workstation stays 200 DIP across ${scenario.sourceScale} to ${scenario.targetScale} scale`,
    );
    assert.equal(
      result.geometry.width,
      actual[0],
      'hydrate canonical width matches native content after crossing DPI',
    );
    console.log(
      `Electron real cross-DPI recovery passed: ${scenario.sourceScale} to ${scenario.targetScale}, full and workstation.`,
    );
  } finally {
    await page.evaluate(
      (geometry) =>
        window.threadlineDesktop.hydrateDesktopState({
          requestId: 1001,
          mode: 'full',
          presentation: 'expanded',
          windowStates: { full: geometry },
        }),
      scenario.original,
    );
  }
}

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
