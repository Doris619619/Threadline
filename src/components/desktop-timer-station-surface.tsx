/** @fileoverview 计时站只提供已水合的 portal 容器，禁止挂载认证、工作区或计时 Provider。 */
'use client';
import { useEffect, useRef } from 'react';

/** 就绪标记在 hydration 后写入，避免 React 重建容器时删除父窗口的 portal。 */
export function DesktopTimerStationSurface() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = '计时站 · Threadline';
    document.documentElement.dataset.timerStation = 'true';
    host.current?.setAttribute('data-timer-station-ready', 'true');
  }, []);
  return <div ref={host} />;
}
