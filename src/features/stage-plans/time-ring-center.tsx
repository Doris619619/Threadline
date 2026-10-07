/** @fileoverview 在圆环内侧留白区域适配名称与时长，保持数字一行且不与圆环相碰。 */
'use client';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { formatMinutes } from '@/features/tasks/task-time';

/** 测量独立原字号样本，同时限制字宽与剩余高度；零值只显示口径与 0min。 */
export function TimeRingCenter({
  total,
  title,
  style,
}: {
  total: number;
  title: string;
  style: CSSProperties;
}) {
  const container = useRef<HTMLDivElement>(null);
  const sample = useRef<HTMLSpanElement>(null);
  const titleNode = useRef<HTMLSpanElement>(null);
  const [sizes, setSizes] = useState<{
    fontSize: number;
    titleMaxSize: number;
  }>();
  const duration = formatMinutes(total);
  /** 容器、字号和字体加载变化时重新适配内圈；没有尺寸时保持初始字号。 */
  useLayoutEffect(() => {
    const node = container.current;
    const text = sample.current;
    const heading = titleNode.current;
    if (!node || !text || !heading) return;
    /** 独立样本避免反馈震荡；长标题占用两行时，时长也必须适配剩余高度。 */
    const fit = () => {
      // 圆形边缘与字体像素取整预留余量，避免窄内圈恰好卡在字宽边界。
      const available = node.clientWidth * 0.9;
      const natural = text.getBoundingClientRect().width;
      if (!available || !natural) return;
      const preferred = parseFloat(getComputedStyle(text).fontSize);
      const gap = parseFloat(getComputedStyle(node).rowGap) || 0;
      const remainingHeight =
        node.clientHeight - heading.getBoundingClientRect().height - gap;
      const fontSize =
        Math.floor(
          Math.min(
            preferred * Math.min(1, available / natural),
            Math.max(1, remainingHeight) / 1.25,
          ) * 64,
        ) / 64;
      const titleMaxSize = Math.max(11, node.clientWidth * 0.18);
      setSizes((previous) =>
        previous?.fontSize === fontSize && previous.titleMaxSize === titleMaxSize
          ? previous
          : { fontSize, titleMaxSize },
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    observer.observe(text);
    observer.observe(heading);
    fit();
    return () => observer.disconnect();
  }, [duration, title]);
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
      <span ref={titleNode} className="stage-time-center-title">
        {title}
      </span>
      <strong style={{ fontSize: sizes?.fontSize }}>{duration}</strong>
      <span ref={sample} className="stage-time-center-sample" aria-hidden="true">
        {duration}
      </span>
    </div>
  );
}
