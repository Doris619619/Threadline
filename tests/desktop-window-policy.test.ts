/** @fileoverview 覆盖框架无关桌面窗口策略的可见性与 DPI 回退规则。 */

import { describe, expect, it } from 'vitest';
import {
  hasSufficientVisibleArea,
  normalizeCompactWindowState,
  normalizeWindowStates,
  resolveSafeWindowState,
  type LogicalWorkArea,
} from '@/lib/desktop-window-policy';

const primaryWorkArea: LogicalWorkArea = { x: 0, y: 0, width: 1920, height: 1040 };

describe('desktop window policy', () => {
  /** 确认同一显示器中的合法持久化 geometry 不会被不必要地覆盖。 */
  it('keeps a fully visible window on its original display', () => {
    const state = { width: 500, height: 800, x: 1200, y: 80 };

    expect(
      resolveSafeWindowState('mini-today', state, [primaryWorkArea], primaryWorkArea),
    ).toEqual(state);
  });

  /** -32000 是 Windows 最小化时常见的离屏哨兵位置，必须回退到可见工作区。 */
  it('recovers a -32000 minimized sentinel position', () => {
    const restored = resolveSafeWindowState(
      'full',
      { width: 1280, height: 840, x: -32000, y: -32000 },
      [primaryWorkArea],
      primaryWorkArea,
    );

    expect(restored).toEqual({ width: 1280, height: 840, x: 320, y: 100 });
  });

  /** 保存位置所属显示器消失后，紧凑窗口应在当前工作区右侧留出边距。 */
  it('recovers a window whose original monitor is no longer available', () => {
    const restored = resolveSafeWindowState(
      'mini-today',
      { width: 500, height: 800, x: -2200, y: 80 },
      [primaryWorkArea],
      primaryWorkArea,
    );

    expect(restored).toEqual({ width: 500, height: 800, x: 1396, y: 24 });
  });

  /** 只露出少于阈值的边缘不算可见，避免用户无法把窗口拖回屏幕。 */
  it('rejects a window with too little visible area', () => {
    const almostOffscreen = { width: 500, height: 800, x: 1881, y: 80 };

    expect(
      hasSufficientVisibleArea('mini-today', almostOffscreen, [primaryWorkArea]),
    ).toBe(false);
    expect(
      resolveSafeWindowState(
        'mini-today',
        almostOffscreen,
        [primaryWorkArea],
        primaryWorkArea,
      ),
    ).toEqual({ width: 500, height: 800, x: 1396, y: 24 });
  });

  /** 125% DPI 下所有输入保持 logical pixel，不能拿 1920x1080 physical pixel 与其混算。 */
  it('preserves valid 125 percent DPI logical coordinates', () => {
    const logicalWorkAreaAt125Percent: LogicalWorkArea = {
      x: 0,
      y: 0,
      width: 1536,
      height: 864,
    };
    const state = { width: 500, height: 800, x: 1012, y: 24 };

    expect(
      resolveSafeWindowState(
        'mini-today',
        state,
        [logicalWorkAreaAt125Percent],
        logicalWorkAreaAt125Percent,
      ),
    ).toEqual(state);
  });

  /** 150% DPI 同样只比较逻辑像素，确保原生 Main 复用 policy 后不会发生物理像素漂移。 */
  it('preserves valid 150 percent DPI logical coordinates', () => {
    const logicalWorkAreaAt150Percent: LogicalWorkArea = {
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    };
    const state = { width: 500, height: 480, x: 756, y: 24 };

    expect(
      resolveSafeWindowState(
        'workstation',
        state,
        [logicalWorkAreaAt150Percent],
        logicalWorkAreaAt150Percent,
      ),
    ).toEqual(state);
  });

  /** 紧凑视图尺寸必须被独立夹取，不能让非法持久化值影响原生壳。 */
  it('normalizes compact dimensions while preserving valid logical coordinates', () => {
    expect(
      normalizeCompactWindowState('workstation', {
        width: 999,
        height: 100,
        x: -120,
        y: 48,
      }),
    ).toEqual({ width: 540, height: 460, x: -120, y: 48 });
  });

  /** 缺失和非法 persisted state 必须恢复为当前三态的安全规格。 */
  it('normalizes malformed persisted window state without accepting legacy modes', () => {
    expect(
      normalizeWindowStates({
        full: { width: 700, height: 500, x: 10, y: 10 },
        'mini-today': { width: Number.NaN, height: 999 },
        workstation: { width: 500, height: 480, x: 80, y: 48 },
        floating: { width: 72, height: 72 },
      }),
    ).toEqual({
      'mini-today': { width: 518, height: 860 },
      workstation: { width: 500, height: 480, x: 80, y: 48 },
    });
  });
});
