/** @fileoverview 验证 Web/PWA 不会从历史桌面偏好恢复紧凑窗口。 */

import { describe, expect, it } from 'vitest';
import { resolveDesktopWindowCapability } from '@/lib/desktop-window-capability';

describe('desktop window capability', () => {
  /** 无 Electron Main Renderer bridge 时，历史紧凑和 Edge 状态不能改变 Web/PWA 壳层。 */
  it('forces full workspace state outside Electron', () => {
    expect(
      resolveDesktopWindowCapability(false, 'workstation', 'edge-collapsed'),
    ).toEqual({ mode: 'full', presentation: 'expanded' });
  });

  /** Electron 获得受限 bridge 后保留 Main 已裁决的模式和 presentation。 */
  it('preserves Main-controlled state in Electron', () => {
    expect(resolveDesktopWindowCapability(true, 'workstation', 'expanded')).toEqual({
      mode: 'workstation',
      presentation: 'expanded',
    });
  });
});
