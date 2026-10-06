/** @fileoverview 渲染单层任务圆环、可访问的外置标签及引导线，按实际标签高度适应小屏与大字号。 */
'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { formatMinutes } from '@/features/tasks/task-time';
import { ringSector, type StageTimeSector } from './time-breakdown';
import { stageTimeLabelLayout } from './time-label-layout';
import { TimeRingCenter } from './time-ring-center';
import { softTimeColor } from './time-colors';

/** 引线沿用项目色相的柔和色阶，与标签共用任务 ID；文字不随圆环缩小。 */
export function StageTimeRing({
  sectors,
  total,
  active,
  centerTitle,
  emptyLabel,
  onSelect,
  onHover,
}: {
  sectors: StageTimeSector[];
  total: number;
  active?: string;
  centerTitle: string;
  emptyLabel: string;
  onSelect: (id: string) => void;
  onHover: (id: string | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; heights: Record<string, number> }>({
    width: 320,
    heights: {},
  });
  const labelIds = sectors.map((sector) => sector.id).join('|');
  /** 字体、标题、容器宽度改变后重新测量；仅在尺寸变化时更新，避免观察器循环。 */
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => {
      const width = node.getBoundingClientRect().width || 320;
      const heights = Object.fromEntries(
        [...node.querySelectorAll<HTMLElement>('[data-stage-label]')].map((label) => [
          label.dataset.stageLabel!,
          label.getBoundingClientRect().height || 64,
        ]),
      );
      setSize((previous) =>
        previous.width === width &&
        JSON.stringify(previous.heights) === JSON.stringify(heights)
          ? previous
          : { width, heights },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node
      .querySelectorAll('[data-stage-label]')
      .forEach((label) => observer.observe(label));
    measure();
    return () => observer.disconnect();
  }, [labelIds]);
  const layout = stageTimeLabelLayout(sectors, size.width, size.heights);
  return (
    <div
      ref={container}
      className="stage-time-visual"
      style={{ height: layout.height }}
      onMouseLeave={() => onHover(undefined)}
    >
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
        {total === 0 && (
          <circle
            cx={layout.cx}
            cy={layout.cy}
            r={(layout.inner + layout.outer) / 2}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={layout.outer - layout.inner}
          />
        )}
        {sectors.map((sector) => (
          <path
            key={sector.id}
            data-stage-slice={sector.id}
            d={ringSector(sector.start, sector.fraction, layout.inner, layout.outer, {
              x: layout.cx,
              y: layout.cy,
            })}
            fill={softTimeColor(sector.color)}
            opacity={
              !active || active === sector.id || active === sector.projectId ? 1 : 0.35
            }
            onMouseEnter={() => onHover(sector.id)}
            onClick={() => onSelect(sector.id)}
          />
        ))}
        {layout.labels.map((label) => (
          <polyline
            key={label.id}
            data-stage-line={label.id}
            points={label.points}
            fill="none"
            stroke={softTimeColor(label.projectColor ?? label.color)}
            strokeWidth="1"
            opacity={
              !active || active === label.id || active === label.projectId ? 0.7 : 0.25
            }
          />
        ))}
      </svg>
      <TimeRingCenter
        total={total}
        title={centerTitle}
        emptyLabel={emptyLabel}
        style={{
          left: layout.cx - layout.inner * 0.85,
          top: layout.cy - layout.inner * 0.85,
          width: layout.inner * 1.7,
          height: layout.inner * 1.7,
        }}
      />
      {layout.labels.map((label) => (
        <button
          type="button"
          key={label.id}
          data-stage-label={label.id}
          className="stage-time-callout"
          style={{ left: label.x, top: label.y, width: label.width }}
          aria-label={'查看 ' + label.title + ' ' + formatMinutes(label.minutes)}
          aria-pressed={active === label.id}
          title={label.title}
          onClick={() => onSelect(label.id)}
          onFocus={() => onHover(label.id)}
          onBlur={() => onHover(undefined)}
          onMouseEnter={() => onHover(label.id)}
        >
          <span>{label.title}</span>
          <small>{formatMinutes(label.minutes)}</small>
        </button>
      ))}
    </div>
  );
}
