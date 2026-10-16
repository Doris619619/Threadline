/** @fileoverview 将现有计时会话投射到同源原生子窗口；不建立第二份计时器、数据 Provider 或写入通道。 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';

const OPEN_EVENT = 'threadline:open-timer-station';

/** 标题栏只发打开意图；账号内唯一的 TaskTimersSession 拥有展示窗口。 */
export function openTimerStation(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** 等待子页 hydration 就绪再挂载 portal；卸载/换账号立即关闭，手动关闭不改变计时。 */
export function useTimerStation(ready: boolean) {
  const child = useRef<Window | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!ready || !getMainDesktopBridge()?.timerStationControl) return;
    let poll: number | undefined;
    let deadline = 0;
    /** 重复入口聚焦同一窗口；只允许 Main 明确放行的 URL 与固定 frameName。 */
    const open = () => {
      if (child.current && !child.current.closed) {
        void getMainDesktopBridge()
          ?.timerStationControl?.({ action: 'focus' })
          .catch(() => setError('计时站未能恢复，请关闭后重试。'));
        return;
      }
      setError('');
      setHost(null);
      const url = new URL(window.location.href);
      url.search = '?threadline-role=timer-station';
      url.hash = '';
      child.current = window.open(url.href, 'threadline-timer-station');
      if (!child.current) {
        setError('计时站未能打开，请重试。');
        return;
      }
      deadline = Date.now() + 20000;
      window.clearInterval(poll);
      poll = window.setInterval(() => {
        const popup = child.current;
        if (!popup || popup.closed) {
          window.clearInterval(poll);
          child.current = null;
          setHost(null);
          return;
        }
        const target = popup.document.querySelector<HTMLElement>(
          '[data-timer-station-ready]',
        );
        if (target) setHost((current) => (current === target ? current : target));
        else if (Date.now() > deadline) {
          popup.close();
          setError('计时站加载超时，请重新打开。');
        }
      }, 200);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener(OPEN_EVENT, open);
      window.clearInterval(poll);
      child.current?.close();
      child.current = null;
    };
  }, [ready]);
  return { host, error };
}
