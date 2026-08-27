/**
 * @fileoverview 荧光笔画板图层组件。支持相对坐标系存储笔迹、鼠标绘制、橡皮擦擦除与窗口 Resize 自适应。
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { isAnnotationVisibleOnDate } from '@/lib/annotation-storage';
import type { AnnotationStroke, AnnotationPoint } from '@/types/domain';

export type AnnotationTool = 'none' | 'highlight' | 'eraser';

interface AnnotationLayerProps {
  /** 当前激活的工具模式 */
  activeTool: AnnotationTool;
  /** 所有笔迹列表 */
  strokes: AnnotationStroke[];
  /** 笔迹更新回调 */
  onChangeStrokes: (strokes: AnnotationStroke[]) => void;
  /** 当前画布所属的本地业务日期 */
  targetDate: string;
  /** 是否允许绘制或擦除 */
  disabled?: boolean;
}

/**
 * 荧光笔画板图层组件。
 * 在激活 highlight 或 eraser 时拦截鼠标事件进行批注或擦除，非批注模式时不阻挡页面正常交互。
 * 坐标均以相对于容器宽高的比例（0~1）保存，确保窗口缩放与响应式排版下笔迹准确对齐。
 */
export function AnnotationLayer({
  activeTool,
  strokes,
  onChangeStrokes,
  targetDate,
  disabled = false,
}: AnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPoints, setCurrentPoints] = useState<AnnotationPoint[]>([]);
  const currentPointsRef = useRef<AnnotationPoint[]>([]);
  const isDrawingRef = useRef(false);

  const filterStrokes = strokes.filter((stroke) =>
    isAnnotationVisibleOnDate(stroke, targetDate),
  );

  const getRelativePoint = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): AnnotationPoint | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      return { x, y };
    },
    [],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || activeTool === 'none') return;
    if (e.button !== 0) return; // 仅左键

    e.preventDefault();
    e.stopPropagation();
    isDrawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);

    const pt = getRelativePoint(e);
    if (!pt) return;

    if (activeTool === 'highlight') {
      currentPointsRef.current = [pt];
      setCurrentPoints([pt]);
    } else if (activeTool === 'eraser') {
      eraseAtPoint(pt);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current || disabled) return;
    const pt = getRelativePoint(e);
    if (!pt) return;

    if (activeTool === 'highlight') {
      // Pointer move 与 up 可能落在同一 React batch；以 ref 为权威，确保 up 能读到最后一个点。
      const next = [...currentPointsRef.current, pt];
      currentPointsRef.current = next;
      setCurrentPoints(next);
    } else if (activeTool === 'eraser') {
      eraseAtPoint(pt);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const points = currentPointsRef.current;
    if (activeTool === 'highlight' && points.length > 1) {
      const newStroke: AnnotationStroke = {
        id: crypto.randomUUID(),
        points,
        color: 'rgba(255, 225, 53, 0.42)', // 柔和通透的真实荧光黄
        strokeWidth: 16,
        createdAt: new Date().toISOString(),
        targetScope: 'date',
        targetDate,
      };
      onChangeStrokes([...strokes, newStroke]);
    }
    currentPointsRef.current = [];
    setCurrentPoints([]);
  };

  /**
   * 橡皮擦检测并擦除相交笔迹
   */
  const eraseAtPoint = (pt: AnnotationPoint) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const thresholdX = 14 / rect.width;
    const thresholdY = 14 / rect.height;

    const remaining = strokes.filter((stroke) => {
      if (!isAnnotationVisibleOnDate(stroke, targetDate)) return true;
      // 检测当前点是否在某条笔迹的任意线段附近
      const hit = stroke.points.some((p) => {
        const dx = Math.abs(p.x - pt.x);
        const dy = Math.abs(p.y - pt.y);
        return dx < thresholdX && dy < thresholdY;
      });
      return !hit;
    });

    if (remaining.length !== strokes.length) {
      onChangeStrokes(remaining);
    }
  };

  // 生成 SVG Path d 属性
  const pointsToSvgPath = (
    points: AnnotationPoint[],
    width: number,
    height: number,
  ) => {
    if (points.length === 0) return '';
    const mapped = points.map((p) => ({ x: p.x * width, y: p.y * height }));
    if (mapped.length === 1) {
      return `M ${mapped[0].x} ${mapped[0].y} L ${mapped[0].x + 0.1} ${mapped[0].y}`;
    }
    let d = `M ${mapped[0].x} ${mapped[0].y}`;
    for (let i = 1; i < mapped.length; i++) {
      d += ` L ${mapped[i].x} ${mapped[i].y}`;
    }
    return d;
  };

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isInteractive = activeTool !== 'none' && !disabled;

  return (
    <div
      ref={containerRef}
      className={`tl-annotation-layer ${isInteractive ? 'is-active' : ''} tool-${activeTool}`}
      onPointerDown={isInteractive ? handlePointerDown : undefined}
      onPointerMove={isInteractive ? handlePointerMove : undefined}
      onPointerUp={isInteractive ? handlePointerUp : undefined}
      onPointerCancel={isInteractive ? handlePointerUp : undefined}
    >
      <svg
        className="tl-annotation-svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="none"
      >
        {/* 已保存的笔迹 */}
        {filterStrokes.map((stroke) => (
          <path
            key={stroke.id}
            data-annotation-scope={stroke.targetScope}
            data-annotation-date={
              stroke.targetScope === 'date' ? stroke.targetDate : 'global'
            }
            d={pointsToSvgPath(stroke.points, dimensions.width, dimensions.height)}
            stroke={stroke.color}
            strokeWidth={stroke.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{ mixBlendMode: 'multiply' }}
          />
        ))}

        {/* 正在绘制中的笔迹 */}
        {currentPoints.length > 0 && (
          <path
            d={pointsToSvgPath(currentPoints, dimensions.width, dimensions.height)}
            stroke="rgba(255, 225, 53, 0.45)"
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{ mixBlendMode: 'multiply' }}
          />
        )}
      </svg>
    </div>
  );
}
