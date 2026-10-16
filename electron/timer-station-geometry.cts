/** @fileoverview 计时站横纵尺寸记忆与工作区恢复；只持久化用户拖动后的逻辑宽高，不保存任务数据。 */
import { app, screen, type BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { applyFramelessGeometry, readFramelessGeometry } from './window-geometry.cjs';

export type StationLayout = 'horizontal' | 'vertical';
type Size = { width: number; height: number };
type Sizes = Partial<Record<StationLayout, Size>>;

/** 缺失、损坏或异常尺寸配置回退默认值；两种排列独立校验。 */
function readSizes(path: string): Sizes {
  const sizes: Sizes = {};
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    for (const layout of ['horizontal', 'vertical'] as const) {
      const size = value?.[layout];
      if (
        Number.isInteger(size?.width) &&
        Number.isInteger(size?.height) &&
        size.width >= 340 &&
        size.height >= 208 &&
        size.width <= 16384 &&
        size.height <= 16384
      )
        sizes[layout] = { width: size.width, height: size.height };
    }
  } catch {
    /* 首次启动或文件损坏不阻止打开计时站。 */
  }
  return sizes;
}

/** 为一个原生窗口绑定手动缩放记忆；程序调整和显示器恢复不会覆盖用户偏好。 */
export function createStationGeometry(window: BrowserWindow) {
  const path = join(app.getPath('userData'), 'timer-station-sizes.json');
  const sizes = readSizes(path);
  let layout: StationLayout = 'horizontal';
  let count = 0;
  let configured = false;
  let manualResize = false;

  /** 只在用户完成边框拖动时写入逻辑内容尺寸，避免 DPI 外框误差累积。 */
  function remember() {
    if (!manualResize || window.isDestroyed()) return;
    manualResize = false;
    const { width, height } = readFramelessGeometry(window);
    sizes[layout] = { width, height };
    try {
      writeFileSync(path + '.tmp', JSON.stringify(sizes), 'utf8');
      renameSync(path + '.tmp', path);
    } catch (error) {
      console.warn('计时站尺寸保存失败：', error);
    }
  }

  /** 将首选尺寸约束到当前工作区；恢复时保留磁盘上的原始首选尺寸。 */
  function fit() {
    if (window.isDestroyed() || manualResize) return;
    const bounds = readFramelessGeometry(window);
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const preferred = sizes[layout] ?? {
      width:
        layout === 'horizontal'
          ? Math.max(340, count * 300 + Math.max(0, count - 1) * 10 + 20)
          : 340,
      height:
        layout === 'horizontal'
          ? 208
          : Math.max(208, count * 144 + Math.max(0, count - 1) * 10 + 64),
    };
    const width = Math.min(preferred.width, area.width);
    const height = Math.min(preferred.height, area.height);
    window.setMinimumSize(Math.min(340, area.width), Math.min(208, area.height));
    applyFramelessGeometry(window, {
      width,
      height,
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    });
  }

  // Electron 的 will-resize 只来自手动拖动，setBounds 不触发。
  window.on('will-resize', () => {
    manualResize = true;
  });
  window.on('resized', remember);
  window.on('close', remember);

  return {
    /** 排列或未自定义时的数量改变才重新布局；置顶切换不影响尺寸和焦点。 */
    configure(nextLayout: StationLayout, nextCount: number) {
      const changed =
        !configured ||
        layout !== nextLayout ||
        (count !== nextCount && !sizes[nextLayout]);
      remember();
      layout = nextLayout;
      count = nextCount;
      configured = true;
      if (changed) fit();
    },
    recover: fit,
  };
}
