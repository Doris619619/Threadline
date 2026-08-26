/**
 * @fileoverview 在任何业务 Provider 前按 Electron role 分流，确保 Edge 不加载完整业务运行时。
 */

'use client';

import dynamic from 'next/dynamic';
import { DesktopEdgeSurface } from '@/components/desktop-edge-surface';
import { getThreadlineDesktopBridge } from '@/lib/desktop-bridge';

const DesktopMainRuntime = dynamic(
  () =>
    import('@/components/desktop-main-runtime').then(
      (module) => module.DesktopMainRuntime,
    ),
  { ssr: false },
);

/** 在同步读取 role 后只挂载对应运行时；Web 走完整业务页面。 */
export function ThreadlineRoot() {
  const role = getThreadlineDesktopBridge()?.role;
  return role === 'edge-tab' ? <DesktopEdgeSurface /> : <DesktopMainRuntime />;
}
