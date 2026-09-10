/** @fileoverview 原生便签高度、贴边拖动及品牌图标；只接受按角色校验的窄 IPC。 */
import { app, BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFramelessGeometry } from './window-geometry.cjs';
import {
  COMPACT_WINDOW_BOUNDS,
  EDGE_TAB_SIZE,
  type DesktopViewMode,
} from '../src/lib/desktop-window-policy.js';

type EdgePosition = { displayId: number; side: 'left' | 'right'; ratio: number };
let edgePosition: EdgePosition | undefined;
let theme: 'blue' | 'anya' | 'cottage' = 'blue';
let drag:
  { x: number; y: number; bounds: Electron.Rectangle; moved: boolean } | undefined;

/** 只持久化应用自己的偏好文件，不读写业务数据或任意 renderer 路径。 */
function savePreferences() {
  writeFileSync(
    join(app.getPath('userData'), 'compact-preferences.json'),
    JSON.stringify({ edgePosition, theme }),
  );
}

/** 容忍旧版/损坏文件；只接收有效主题与有限的显示器相对位置。 */
export function loadCompactPreferences() {
  try {
    const metadata = JSON.parse(
      readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'),
    );
    theme = metadata.threadlineIconTheme === 'anya' ? 'anya' : 'blue';
  } catch {
    /* 开发环境没有打包主题时使用蓝色。 */
  }
  try {
    const data = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'compact-preferences.json'), 'utf8'),
    );
    theme =
      data.theme === 'cottage' ? 'cottage' : data.theme === 'anya' ? 'anya' : 'blue';
    const position = data.edgePosition;
    if (
      position &&
      Number.isFinite(position.displayId) &&
      ['left', 'right'].includes(position.side) &&
      Number.isFinite(position.ratio)
    ) {
      edgePosition = {
        displayId: position.displayId,
        side: position.side,
        ratio: Math.max(0, Math.min(1, position.ratio)),
      };
    }
  } catch {
    /* 首次启动和损坏偏好使用默认值。 */
  }
}

/** 从打包内白名单选择图标；不存在的主题资源不能由 renderer 指定。 */
export function getThemedWindowIcon() {
  return join(
    app.getAppPath(),
    'electron',
    'assets',
    theme === 'cottage'
      ? 'icon-cottage.ico'
      : theme === 'anya'
        ? 'icon-anya.ico'
        : 'icon.ico',
  );
}

/** 将入口恢复到保存的屏幕边缘；已移除的屏幕回退到当前业务窗所在屏幕。 */
export function placeEdgeWindow(window: BrowserWindow, fallback: Electron.Display) {
  const display =
    screen.getAllDisplays().find((item) => item.id === edgePosition?.displayId) ??
    fallback;
  const area = display.workArea;
  const bounds = window.getBounds();
  window.setBounds({
    ...EDGE_TAB_SIZE,
    x: edgePosition?.side === 'left' ? area.x : area.x + area.width - bounds.width,
    y: Math.round(
      area.y + (area.height - bounds.height) * (edgePosition?.ratio ?? 0.5),
    ),
  });
  window.setAlwaysOnTop(true, 'floating');
}

/** 注册经过 Main 身份检查的内容测量、主题选择和指针拖动命令。 */
export function registerCompactControls({
  getMain,
  getEdge,
  getMode,
  isExpanded,
  isTrusted,
  onResize,
}: {
  getMain: () => BrowserWindow | undefined;
  getEdge: () => BrowserWindow | undefined;
  getMode: () => DesktopViewMode;
  isExpanded: () => boolean;
  isTrusted: (event: IpcMainInvokeEvent, role: 'main' | 'edge-tab') => boolean;
  onResize: (geometry: Electron.Rectangle) => void;
}) {
  /** 高度上限独立于内容；过期模式的 ResizeObserver 消息不影响新窗口。 */
  ipcMain.handle('desktop:compact-height', (event, mode: unknown, height: unknown) => {
    if (!isTrusted(event, 'main')) throw new Error('Rejected compact size sender');
    if (
      mode !== 'workstation' ||
      typeof height !== 'number' ||
      !Number.isFinite(height)
    )
      throw new Error('Invalid compact size');
    const window = getMain();
    if (
      !window ||
      window.isDestroyed() ||
      getMode() !== mode ||
      !isExpanded() ||
      !window.isVisible() ||
      window.isMinimized()
    )
      return;
    const bounds = readFramelessGeometry(window);
    const area = screen.getDisplayMatching(bounds).workArea;
    const limits = COMPACT_WINDOW_BOUNDS[mode];
    const nextHeight = Math.min(
      area.height,
      Math.max(limits.minHeight, Math.min(limits.maxHeight, Math.ceil(height))),
    );
    if (bounds.height === nextHeight) return;
    const next = {
      ...bounds,
      height: nextHeight,
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - nextHeight)),
    };
    window.setBounds(next);
    onResize(next);
  });
  /** 主题只接收枚举，更新所有现存窗口并保存供下次启动首帧使用。 */
  ipcMain.handle('desktop:appearance', (event, value: unknown) => {
    if (
      !isTrusted(event, 'main') ||
      !['blue', 'anya', 'cottage'].includes(String(value))
    )
      throw new Error('Invalid desktop appearance');
    theme = value as typeof theme;
    for (const window of [getMain(), getEdge()])
      if (window && !window.isDestroyed()) window.setIcon(getThemedWindowIcon());
    savePreferences();
  });
  /** 坐标来自原生 screen，renderer 不能移动任意窗口；超过 4 DIP 才算拖动。 */
  ipcMain.handle('desktop:edge-pointer', (event, phase: unknown) => {
    if (
      !isTrusted(event, 'edge-tab') ||
      !['start', 'move', 'end', 'cancel'].includes(String(phase))
    )
      throw new Error('Invalid edge pointer');
    const window = getEdge();
    if (!window || window.isDestroyed()) return false;
    const cursor = screen.getCursorScreenPoint();
    if (phase === 'start') {
      drag = { ...cursor, bounds: window.getBounds(), moved: false };
      return false;
    }
    if (!drag) return false;
    const dx = cursor.x - drag.x,
      dy = cursor.y - drag.y;
    drag.moved ||= Math.hypot(dx, dy) > 4;
    if (drag.moved) {
      // Windows 250% 下 setPosition / getBounds 回填会每次增加约 1 DIP 高度。
      // 定位只使用固定规格，绝不把原生尺寸读回后作为下一次的输入。
      const x = Math.round(drag.bounds.x + dx),
        y = Math.round(drag.bounds.y + dy);
      const current = window.getBounds();
      if (current.x !== x || current.y !== y)
        window.setBounds({ ...EDGE_TAB_SIZE, x, y });
    }
    if (phase === 'move') return drag.moved;
    const moved = drag.moved;
    drag = undefined;
    if (moved) {
      const display = screen.getDisplayNearestPoint(cursor),
        area = display.workArea,
        bounds = window.getBounds();
      edgePosition = {
        displayId: display.id,
        side: cursor.x < area.x + area.width / 2 ? 'left' : 'right',
        ratio: Math.max(
          0,
          Math.min(1, (bounds.y - area.y) / Math.max(1, area.height - bounds.height)),
        ),
      };
      placeEdgeWindow(window, display);
      savePreferences();
    }
    return moved;
  });
}
