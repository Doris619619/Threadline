/** @fileoverview 只响应明确点击的原生贴边入口；捕获指针拖动，由 Main 计算屏幕坐标。 */
'use client';
import { useRef } from 'react';
import { getThreadlineDesktopBridge } from '@/lib/desktop-bridge';

/** Edge 不挂载业务 Provider，拖动结束与键盘激活均经过最小 bridge。 */
export function DesktopEdgeSurface() {
  const dragging = useRef(false);
  /** 仅恢复工作站，销毁过程的 IPC 竞争可以安全忽略。 */
  const restore = () => {
    const bridge = getThreadlineDesktopBridge();
    if (bridge?.role === 'edge-tab') void bridge.restoreMain().catch(() => undefined);
  };
  return (
    <button
      type="button"
      className="edge-tab"
      aria-label="展开工作站"
      title="点击展开，拖动调整贴边位置"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const bridge = getThreadlineDesktopBridge();
        if (bridge?.role !== 'edge-tab') return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        void bridge.edgePointer('start').catch(() => {
          dragging.current = false;
        });
      }}
      onPointerMove={() => {
        const bridge = getThreadlineDesktopBridge();
        if (dragging.current && bridge?.role === 'edge-tab')
          void bridge.edgePointer('move').catch(() => undefined);
      }}
      onPointerUp={async (event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const bridge = getThreadlineDesktopBridge();
        if (bridge?.role !== 'edge-tab') return;
        try {
          if (!(await bridge.edgePointer('end'))) restore();
        } catch {
          /* 窗口销毁后不恢复。 */
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
        const bridge = getThreadlineDesktopBridge();
        if (bridge?.role === 'edge-tab')
          void bridge.edgePointer('cancel').catch(() => undefined);
      }}
      onClick={(event) => {
        if (event.detail === 0) restore();
      }}
    >
      <span>Threadline</span>
      <small>展开</small>
    </button>
  );
}
