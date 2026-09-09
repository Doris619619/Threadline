/** @fileoverview 测量列表自然高度，由 Main 限幅调整便签窗口，避免 viewport 反馈循环。 */
'use client';
import { useEffect, useRef } from 'react';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import type { CompactViewMode } from '@/lib/desktop-window-policy';

/** 只观察自然流列表；标题栏、底部和边距共 68px，超限由内部滚动承载。 */
export function useCompactContentHeight(mode: CompactViewMode) {
  const ref = useRef<HTMLUListElement & HTMLOListElement>(null);
  useEffect(() => {
    const content = ref.current;
    const bridge = getMainDesktopBridge();
    if (!content || !bridge?.resizeCompactContent) return;
    let frame = 0;
    /** 合并同一帧的布局变化，防止字库加载或任务更新重复 resize。 */
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void bridge
          .resizeCompactContent(
            mode,
            Math.ceil(content.getBoundingClientRect().height + 68),
          )
          .catch(() => undefined);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mode]);
  return ref;
}
