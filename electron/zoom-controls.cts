/** @fileoverview 为无菜单桌面主窗口提供 Ctrl 加减号与 Ctrl+0 页面缩放，不改变原生窗口尺寸。 */
import type { BrowserWindow } from 'electron';

/** 仅在本窗口内处理缩放按键；隔离缩放避免影响同源的固定尺寸贴边窗口。 */
export function registerDesktopZoom(window: BrowserWindow): void {
  const contents = window.webContents;
  contents.setZoomMode('isolated');
  /** 消费按下的缩放组合，包括主键盘和小键盘；普通输入与组合输入继续交给 Renderer。 */
  contents.on('before-input-event', (event, input) => {
    if (
      input.type !== 'keyDown' ||
      !input.control ||
      input.alt ||
      input.meta ||
      input.isComposing
    )
      return;
    const increase =
      ['+', '='].includes(input.key) || ['Equal', 'NumpadAdd'].includes(input.code);
    const decrease =
      input.key === '-' || ['Minus', 'NumpadSubtract'].includes(input.code);
    const reset = input.key === '0' || ['Digit0', 'Numpad0'].includes(input.code);
    if (!increase && !decrease && !reset) return;
    event.preventDefault();
    contents.setZoomLevel(reset ? 0 : contents.getZoomLevel() + (increase ? 1 : -1));
  });
}
