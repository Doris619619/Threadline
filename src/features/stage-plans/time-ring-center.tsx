/** @fileoverview 根据圆环内圈和当前字体的真实宽度调整总时长，保持完整数字在一行内。 */
'use client';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { formatMinutes } from '@/features/tasks/task-time';

/** 测量独立的原字号文本，避免缩小后的文本反过来触发字号震荡。 */
export function TimeRingCenter({
  total,
  title,
  emptyLabel,
  style,
}: {
  total: number;
  title: string;
  emptyLabel: string;
  style: CSSProperties;
}) {
  const container = useRef<HTMLDivElement>(null);
  const sample = useRef<HTMLSpanElement>(null);
  const [sizes, setSizes] = useState<{
    fontSize: number;
    titleMaxSize: number;
  }>();
  const duration = formatMinutes(total);
  /** 容器、字号和字体加载变化时重新适配内圈；没有尺寸时保持初始字号。 */
  useLayoutEffect(() => {
    const node = container.current;
    const text = sample.current;
    if (!node || !text) return;
    /** 从独立样本计算一行字宽，标题与数字共用内圈像素；只保存变化后的稳定尺寸。 */
    const fit = () => {
      // 圆形边缘与字体像素取整预留余量，避免窄内圈恰好卡在字宽边界。
      const available = node.clientWidth * 0.9;
      const natural = text.getBoundingClientRect().width;
      if (!available || !natural) return;
      const preferred = parseFloat(getComputedStyle(text).fontSize);
      const fontSize =
        Math.floor(preferred * Math.min(1, available / natural) * 64) / 64;
      const titleMaxSize = node.clientWidth * 0.18;
      setSizes((previous) =>
        previous?.fontSize === fontSize && previous.titleMaxSize === titleMaxSize
          ? previous
          : { fontSize, titleMaxSize },
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    observer.observe(text);
    fit();
    return () => observer.disconnect();
  }, [duration]);
  return (
    <div
      ref={container}
      className="stage-time-center"
      style={
        {
          ...style,
          '--time-center-title-max-size': sizes ? sizes.titleMaxSize + 'px' : undefined,
        } as CSSProperties
      }
    >
      <span className="stage-time-center-title">{title}</span>
      <strong style={{ fontSize: sizes?.fontSize }}>{duration}</strong>
      <span ref={sample} className="stage-time-center-sample" aria-hidden="true">
        {duration}
      </span>
      {total === 0 && <small>{emptyLabel}</small>}
    </div>
  );
}
