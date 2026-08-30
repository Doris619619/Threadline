/** @fileoverview 将 Electron bridge 能力归一为 Renderer 可安全使用的窗口状态。 */

import type { CompactPresentation, DesktopViewMode } from '@/lib/desktop-window-policy';

/**
 * 在缺少 Electron Main Renderer bridge 时强制 Web/PWA 使用完整工作台，
 * 避免历史 localStorage 模式渲染无法执行的原生窗口入口。
 */
export function resolveDesktopWindowCapability(
  isNativeDesktop: boolean,
  mode: DesktopViewMode,
  presentation: CompactPresentation,
): { mode: DesktopViewMode; presentation: CompactPresentation } {
  return isNativeDesktop
    ? { mode, presentation }
    : { mode: 'full', presentation: 'expanded' };
}
