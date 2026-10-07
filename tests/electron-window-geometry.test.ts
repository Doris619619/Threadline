/** @fileoverview 验证无框窗口跨 DPI 后的宽高校正、外框取整容忍及系统最大化边界。 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { BrowserWindow } from 'electron';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const runtimeModule = {
  exports: {} as {
    applyFramelessGeometry: (
      window: BrowserWindow,
      geometry: Electron.Rectangle,
    ) => void;
  },
};
runInNewContext(
  ts.transpileModule(readFileSync('electron/window-geometry.cts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { module: runtimeModule, exports: runtimeModule.exports },
);

/** 模拟第一次跨屏尺寸被 Windows DPI 消息覆盖；第二次在目标屏应用时使用正确 DIP，系统窗口状态可独立设置。 */
function createWindow(
  firstSize: [number, number],
  state: 'normal' | 'maximized' | 'minimized' = 'normal',
) {
  const desired = { x: 24, y: 24, width: 200, height: 111 };
  let contentSize = firstSize;
  let applications = 0;
  const setBounds = vi.fn(() => {
    applications += 1;
    contentSize = applications === 1 ? firstSize : [desired.width, desired.height];
  });
  const window = {
    setBounds,
    getBounds: () => ({
      ...desired,
      width: contentSize[0] + 1,
      height: contentSize[1] + 1,
    }),
    getContentSize: () => contentSize,
    isMaximized: () => state === 'maximized',
    isMinimized: () => state === 'minimized',
  } as unknown as BrowserWindow;
  return { window, desired, setBounds };
}

/** 150% 到 250% 覆盖尺寸后必须重新施加原始规格，不能把 340 DIP 当成新的用户宽度。 */
test('corrects the native DPI overwrite using the requested content dimensions', () => {
  const { window, desired, setBounds } = createWindow([340, 191]);
  runtimeModule.exports.applyFramelessGeometry(window, desired);
  expect(setBounds).toHaveBeenCalledTimes(2);
  expect(window.getContentSize()).toEqual([200, 111]);
});

/** 内容尺寸已正确或只有一 DIP 差异时，不因外框向外取整多次设置窗口。 */
test.each([
  [200, 111],
  [201, 112],
] as [number, number][])('tolerates stable content size %s by %s', (width, height) => {
  const { window, desired, setBounds } = createWindow([width, height]);
  runtimeModule.exports.applyFramelessGeometry(window, desired);
  expect(setBounds).toHaveBeenCalledTimes(1);
});

/** 最大化和最小化读回的是系统窗口状态，不能据此覆盖用户的还原尺寸。 */
test.each(['maximized', 'minimized'] as const)(
  'preserves system %s window sizing',
  (state) => {
    const { window, desired, setBounds } = createWindow([1152, 672], state);
    runtimeModule.exports.applyFramelessGeometry(window, desired);
    expect(setBounds).toHaveBeenCalledTimes(1);
  },
);
