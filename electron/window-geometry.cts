/** @fileoverview 读取无框 Main 的可重用逻辑尺寸，避免 Windows 外框向外取整的累积误差。 */
import type { BrowserWindow } from 'electron';

/** 位置仍采用屏幕坐标；宽高用内容尺寸，不能将 getBounds 的包围外框反复回填 setBounds。 */
export function readFramelessGeometry(window: BrowserWindow): Electron.Rectangle {
  const { x, y } = window.getBounds();
  const [width, height] = window.getContentSize();
  return { x, y, width, height };
}
