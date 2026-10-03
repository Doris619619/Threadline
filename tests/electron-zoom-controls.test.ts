/** @fileoverview 验证无菜单窗口的缩放键与原生输入边界，不启动应用或改动用户设置。 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { BrowserWindow } from 'electron';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

// 与 Main 的编译路径一致；Vitest 不直接转换 .cts，且测试不能加载 Electron 原生进程。
const runtimeModule = {
  exports: {} as { registerDesktopZoom: (window: BrowserWindow) => void },
};
runInNewContext(
  ts.transpileModule(readFileSync('electron/zoom-controls.cts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { module: runtimeModule, exports: runtimeModule.exports },
);

/** 注入可观察的 WebContents，模拟键盘事件；正常文本、组合输入及其他快捷键必须透传。 */
function setup() {
  const events = new EventEmitter();
  let level = 0;
  const setZoomMode = vi.fn();
  const setZoomLevel = vi.fn((next: number) => {
    level = next;
  });
  runtimeModule.exports.registerDesktopZoom({
    webContents: {
      setZoomMode,
      setZoomLevel,
      getZoomLevel: () => level,
      on: events.on.bind(events),
    },
  } as unknown as BrowserWindow);
  /** 发送一轮按键并返回是否拦截，便于核对缩放组合和输入法透传。 */
  const press = (input: Partial<Electron.Input>) => {
    const preventDefault = vi.fn();
    events.emit(
      'before-input-event',
      { preventDefault },
      {
        type: 'keyDown',
        control: true,
        key: '',
        code: '',
        ...input,
      },
    );
    return preventDefault;
  };
  return { press, setZoomMode, setZoomLevel, level: () => level };
}

/** 核对连续放大、缩小到 100% 以下及两种键盘复位，不向同源窗口共享倍率。 */
test('zooms main and numpad keys and resets the isolated window', () => {
  const state = setup();
  expect(state.setZoomMode).toHaveBeenCalledExactlyOnceWith('isolated');
  for (const input of [{ key: '+' }, { key: '=' }, { code: 'NumpadAdd' }]) {
    expect(state.press(input)).toHaveBeenCalledOnce();
  }
  expect(state.level()).toBe(3);
  for (const input of [{ key: '-' }, { code: 'NumpadSubtract' }]) {
    expect(state.press(input)).toHaveBeenCalledOnce();
  }
  expect(state.level()).toBe(1);
  expect(state.press({ key: '0' })).toHaveBeenCalledOnce();
  expect(state.level()).toBe(0);
  expect(state.press({ key: '-' })).toHaveBeenCalledOnce();
  expect(state.level()).toBe(-1);
  expect(state.press({ code: 'Numpad0' })).toHaveBeenCalledOnce();
  expect(state.level()).toBe(0);
});

/** 缩放不得吞掉无 Ctrl 的文本、IME、其他组合或抬键事件。 */
test('preserves typing, IME, unrelated shortcuts and keyup', () => {
  const state = setup();
  for (const input of [
    { key: '+', control: false },
    { key: '-', alt: true },
    { key: '+', meta: true },
    { key: '+', isComposing: true },
    { key: '=', type: 'keyUp' },
    { key: 'a' },
  ])
    expect(state.press(input)).not.toHaveBeenCalled();
  expect(state.setZoomLevel).not.toHaveBeenCalled();
});
