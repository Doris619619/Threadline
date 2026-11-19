/** @fileoverview 计时站优先完整适配卡片；比例过小时改为可滚动的原尺寸卡片，保留真实可点击目标。 */
'use client';
import { useLayoutEffect, useRef } from 'react';

/** 观察子窗口视口和内容；36px 按钮缩放后不得小于24px，否则保持原尺寸并允许键盘/指针滚动。 */
export function useTimerStationFit(count: number, layout: 'horizontal' | 'vertical') {
  const viewportRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    const view = viewport?.ownerDocument.defaultView;
    if (!viewport || !canvas || !view) return;
    let frame = 0;
    /** 标题栏不缩放，普通卡片最多放大到125%；紧凑窗不再把所有操作一起缩到无法命中。 */
    function fit() {
      if (!viewport || !canvas) return;
      const width = Math.max(1, viewport.clientWidth - 20);
      const height = Math.max(1, viewport.clientHeight - 20);
      if (!count) {
        delete viewport.dataset.fit;
        delete canvas.dataset.fit;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.transform = 'none';
        return;
      }
      const baseWidth = layout === 'horizontal' ? count * 300 + (count - 1) * 10 : 320;
      const baseHeight = layout === 'horizontal' ? 144 : count * 144 + (count - 1) * 10;
      canvas.dataset.fit = 'scale';
      viewport.dataset.fit = 'scale';
      canvas.style.height = 'auto';
      const scale = Math.min(
        1.25,
        width / baseWidth,
        height / Math.max(baseHeight, canvas.scrollHeight),
      );
      if (scale < 2 / 3) {
        const cardWidth = Math.min(320, width);
        canvas.dataset.fit = 'scroll';
        viewport.dataset.fit = 'scroll';
        canvas.style.setProperty('--timer-station-card-width', `${cardWidth}px`);
        canvas.style.width = `${layout === 'horizontal' ? count * cardWidth + (count - 1) * 10 : cardWidth}px`;
        canvas.style.transform = 'none';
        return;
      }
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
