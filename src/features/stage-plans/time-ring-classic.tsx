/** @fileoverview 经典时间双层圆环：内圈项目、外圈任务，与新版共用统计、选择和可访问明细。 */
'use client';
import {
  ringSector,
  type StageTimeGroup,
  type StageTimeSector,
} from './time-breakdown';
import { softTimeColor } from './time-colors';
import { TimeRingCenter } from './time-ring-center';

/** 共用真实分母生成两层扇区；右侧明细提供键盘/触屏选择，零值不会生成扇区。 */
export function ClassicTimeRing({
  groups,
  sectors,
  total,
  active,
  centerTitle,
  emptyLabel,
  onSelect,
  onHover,
}: {
  groups: StageTimeGroup[];
  sectors: StageTimeSector[];
  total: number;
  active?: string;
  centerTitle: string;
  emptyLabel: string;
  onSelect: (id: string) => void;
  onHover: (id?: string) => void;
}) {
  const group = groups.find((group) => group.id === active);
  const item = groups
    .flatMap((group) => group.items)
    .find((item) => item.id === active);
  return (
    <div
      className="stage-time-visual stage-time-classic"
      onMouseLeave={() => onHover(undefined)}
    >
      <svg viewBox="0 0 320 320" aria-hidden="true">
        {total === 0 && (
          <circle
            cx="160"
            cy="160"
            r="112"
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth="48"
          />
        )}
        {groups.map((project) => {
          const start =
            sectors.find((sector) => sector.projectId === project.id)?.start ?? 0;
          const fraction = total ? project.total / total : 0;
          return fraction > 0 ? (
            <path
              key={project.id}
              data-stage-project-slice={project.id}
              d={ringSector(start, fraction, 78, 107)}
              fill={softTimeColor(project.color)}
              opacity={
                !active ||
                active === project.id ||
                project.items.some((item) => item.id === active)
                  ? 1
                  : 0.35
              }
              onMouseEnter={() => onHover(project.id)}
              onClick={() => onSelect(project.id)}
            />
          ) : null;
        })}
        {sectors.map((sector) => (
          <path
            key={sector.id}
            data-stage-slice={sector.id}
            d={ringSector(sector.start, sector.fraction, 112, 144)}
            fill={softTimeColor(sector.color)}
            stroke="var(--surface)"
            strokeWidth="1"
            opacity={
              !active || active === sector.id || active === sector.projectId ? 1 : 0.35
            }
            onMouseEnter={() => onHover(sector.id)}
            onClick={() => onSelect(sector.id)}
          />
        ))}
      </svg>
      <TimeRingCenter
        total={group?.total ?? (item?.minutes === undefined ? total : item.minutes)}
        title={group?.name ?? (item?.minutes === undefined ? centerTitle : item.title)}
        emptyLabel={emptyLabel}
        style={{
          left: '29.28125%',
          top: '29.28125%',
          width: '41.4375%',
          height: '41.4375%',
        }}
      />
    </div>
  );
}
