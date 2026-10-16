/** @fileoverview 按计时站真实可用宽高等比适配全部卡片；保留横纵排列，不借用首页手机断点。 */
'use client';
import { useLayoutEffect, useRef } from 'react';

/** 观察子窗口中的视口和卡片高度；统一缩放文字、按钮和间距，错误提示增高时也重新适配。 */
export function useTimerStationFit(count: number, layout: 'horizontal' | 'vertical') {
  const viewportRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    const view = viewport?.ownerDocument.defaultView;
    if (!viewport || !canvas || !view) return;
    let frame = 0;
    /** 原生窗口尺寸以 CSS 像素测量；标题栏不缩放，卡片区域最大放大到 125%。 */
    function fit() {
      if (!viewport || !canvas) return;
      const width = Math.max(1, viewport.clientWidth - 20);
      const height = Math.max(1, viewport.clientHeight - 20);
      if (!count) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.transform = 'none';
        return;
      }
      const baseWidth = layout === 'horizontal' ? count * 300 + (count - 1) * 10 : 320;
      const baseHeight = layout === 'horizontal' ? 144 : count * 144 + (count - 1) * 10;
      canvas.style.height = 'auto';
      const scale = Math.min(
        1.25,
        width / baseWidth,
        height / Math.max(baseHeight, canvas.scrollHeight),
      );
      canvas.style.width = `${Math.floor((width / scale) * 100) / 100}px`;
      canvas.style.transform = `scale(${scale})`;
    }
    /** 合并拖动期间的测量，避免 ResizeObserver 回调内写尺寸导致循环告警。 */
    const schedule = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(fit);
    };
    const observer = new view.ResizeObserver(schedule);
    observer.observe(viewport);
    observer.observe(canvas);
    fit();
    return () => {
      observer.disconnect();
      view.cancelAnimationFrame(frame);
    };
  }, [count, layout]);
  return { viewportRef, canvasRef };
}
