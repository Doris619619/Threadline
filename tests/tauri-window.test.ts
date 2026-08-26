/** @fileoverview 覆盖桌面窗口恢复的纯逻辑可见性与 DPI 回退规则。 */

import { describe, expect, it } from 'vitest';
import { hasSufficientVisibleArea, resolveSafeWindowState, type LogicalWorkArea } from '@/lib/tauri-window';

const primaryWorkArea: LogicalWorkArea = { x: 0, y: 0, width: 1920, height: 1040 };

describe('Tauri window geometry recovery', () => {
  /** 确认同一显示器中的合法持久化 geometry 不会被不必要地覆盖。 */
  it('keeps a fully visible window on its original display', () => {
    const state = { width: 420, height: 660, x: 1200, y: 80 };

    expect(resolveSafeWindowState('mini-today', state, [primaryWorkArea], primaryWorkArea)).toEqual(state);
  });

  /** -32000 是 Windows 最小化时常见的离屏哨兵位置，必须回退到可见工作区。 */
  it('recovers a -32000 minimized sentinel position', () => {
    const restored = resolveSafeWindowState('full', { width: 1280, height: 840, x: -32000, y: -32000 }, [primaryWorkArea], primaryWorkArea);

    expect(restored).toEqual({ width: 1280, height: 840, x: 320, y: 100 });
  });

  /** 保存位置所属显示器消失后，紧凑窗口应在当前工作区右侧留出边距。 */
  it('recovers a window whose original monitor is no longer available', () => {
    const restored = resolveSafeWindowState('mini-today', { width: 420, height: 660, x: -2200, y: 80 }, [primaryWorkArea], primaryWorkArea);

    expect(restored).toEqual({ width: 420, height: 660, x: 1476, y: 24 });
  });

  /** 只露出少于阈值的边缘不算可见，避免用户无法把窗口拖回屏幕。 */
  it('rejects a window with too little visible area', () => {
    const almostOffscreen = { width: 420, height: 660, x: 1881, y: 80 };

    expect(hasSufficientVisibleArea('mini-today', almostOffscreen, [primaryWorkArea])).toBe(false);
    expect(resolveSafeWindowState('mini-today', almostOffscreen, [primaryWorkArea], primaryWorkArea)).toEqual({ width: 420, height: 660, x: 1476, y: 24 });
  });

  /** 125% DPI 下所有输入保持 logical pixel，不能拿 1920x1080 physical pixel 与其混算。 */
  it('preserves valid 125 percent DPI logical coordinates', () => {
    const logicalWorkAreaAt125Percent: LogicalWorkArea = { x: 0, y: 0, width: 1536, height: 864 };
    const state = { width: 420, height: 660, x: 1092, y: 24 };

    expect(resolveSafeWindowState('mini-today', state, [logicalWorkAreaAt125Percent], logicalWorkAreaAt125Percent)).toEqual(state);
  });
});
