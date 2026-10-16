/**
 * @fileoverview 在任何业务 Provider 前按 Electron role 分流，确保 Edge 和计时站不加载完整业务运行时。
 */

'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { DesktopEdgeSurface } from '@/components/desktop-edge-surface';
import { DesktopTimerStationSurface } from '@/components/desktop-timer-station-surface';
import { getThreadlineDesktopBridge } from '@/lib/desktop-bridge';

const DesktopMainRuntime = dynamic(
  () =>
    import('@/components/desktop-main-runtime').then(
      (module) => module.DesktopMainRuntime,
    ),
  { ssr: false },
);

/** Preload 的角色在文档生命周期内固定；首个 hydration 帧与静态 HTML 都保持空壳。 */
const subscribeRole = () => () => undefined;
/** 读取 preload 角色；普通浏览器进入完整工作台。 */
const clientRole = () => getThreadlineDesktopBridge()?.role ?? 'main';
/** 服务端和首次 hydration 不猜测原生角色。 */
const serverRole = () => 'boot' as const;

/** 在同步读取 role 后只挂载对应运行时；Web 走完整业务页面。 */
export function ThreadlineRoot() {
  const role = useSyncExternalStore(subscribeRole, clientRole, serverRole);
  if (role === 'boot') return null;
  if (role === 'timer-station') return <DesktopTimerStationSurface />;
  return role === 'edge-tab' ? <DesktopEdgeSurface /> : <DesktopMainRuntime />;
}
