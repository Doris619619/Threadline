/** @fileoverview 读写无框 Main 的逻辑尺寸，隔离 Windows 外框取整和跨屏 DPI 消息覆盖。 */
import type { BrowserWindow } from 'electron';

/** 位置仍采用屏幕坐标；宽高用内容尺寸，不能将 getBounds 的包围外框反复回填 setBounds。 */
export function readFramelessGeometry(window: BrowserWindow): Electron.Rectangle {
  const { x, y } = window.getBounds();
  const [width, height] = window.getContentSize();
  return { x, y, width, height };
}

/** 跨不同 DPI 的屏幕定位时，Windows 可在第一次 setBounds 内覆盖目标宽高；在新屏重施一次尺寸，容忍一 DIP 取整。 */
export function applyFramelessGeometry(
  window: BrowserWindow,
  geometry: Pick<Electron.Rectangle, 'width' | 'height'> &
    Partial<Pick<Electron.Rectangle, 'x' | 'y'>>,
): void {
  window.setBounds(geometry);
  if (window.isMaximized() || window.isMinimized()) return;
  const actual = readFramelessGeometry(window);
  if (
    Math.abs(actual.width - geometry.width) > 1 ||
    Math.abs(actual.height - geometry.height) > 1
  ) {
    window.setBounds(geometry);
  }
}
