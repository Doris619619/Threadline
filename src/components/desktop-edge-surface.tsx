/**
 * @fileoverview Electron Edge 轻量入口，只恢复 Main，绝不挂载业务 Provider 或任务运行时。
 */

'use client';

import { useCallback, useRef } from 'react';
import { getThreadlineDesktopBridge } from '@/lib/desktop-bridge';

/** 渲染 Edge 独立窗口的最小恢复控件。 */
export function DesktopEdgeSurface() {
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** 请求 Main 恢复，并吞掉窗口已销毁时的可恢复 IPC 竞争。 */
  const restoreMain = useCallback(() => {
    const bridge = getThreadlineDesktopBridge();
    if (bridge?.role === 'edge-tab') void bridge.restoreMain().catch(() => undefined);
  }, []);

  /** 连续悬停后恢复，避免经过屏幕右缘时反复切换。 */
  const scheduleRestore = useCallback(() => {
    restoreTimerRef.current = setTimeout(restoreMain, 260);
  }, [restoreMain]);

  /** 取消尚未触发的悬停恢复。 */
  const cancelRestore = useCallback(() => {
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
  }, []);

  return (
    <button
      type="button"
      className="edge-tab"
      aria-label="展开最近的紧凑工作台"
      onPointerEnter={scheduleRestore}
      onPointerLeave={cancelRestore}
      onClick={restoreMain}
    >
      <span>Threadline</span>
      <small>展开</small>
    </button>
  );
}
