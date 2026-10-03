/** @fileoverview 计算任务圆环和外置标签的稳定布局；逐侧避让并增长画布，不丢弃小扇区标签。 */
import type { StageTimeSector } from './time-breakdown';

/** 使用实际标签高度排布左右两列；允许小屏缩小圆环，文字不随 SVG 缩放。 */
export function stageTimeLabelLayout(
  sectors: StageTimeSector[],
  width: number,
  labelHeights: Record<string, number> = {},
) {
  const labelWidth = Math.min(200, width * 0.25);
  const gutter = width < 480 ? 4 : 20;
  const outer = Math.min(142, Math.max(1, (width - labelWidth * 2 - gutter * 2) / 2));
  const rows = sectors.map((sector) => {
    const angle = (sector.start + sector.fraction / 2) * Math.PI * 2;
    return {
      ...sector,
      angle,
      side: Math.sin(angle) >= 0 ? 1 : -1,
      height: labelHeights[sector.id] ?? 64,
    };
  });
  const sides = [-1, 1].map((side) =>
    rows
      .filter((row) => row.side === side)
      .sort(
        (a, b) => -Math.cos(a.angle) + Math.cos(b.angle) || a.id.localeCompare(b.id),
      ),
  );
  const gap = 8;
  const margin = 20;
  const height = Math.max(
    outer * 2 + margin * 2,
    ...sides.map(
      (side) => side.reduce((sum, row) => sum + row.height + gap, 0) - gap + margin * 2,
    ),
  );
  const cx = width / 2;
  const cy = height / 2;
  const labels = sides.flatMap((side) => {
    let bottom = margin - gap;
    const placed = side.map((row) => {
      const desired = cy - Math.cos(row.angle) * (outer + 12);
      const y = Math.max(desired - row.height / 2, bottom + gap);
      bottom = y + row.height;
      return { ...row, y };
    });
    // 从下往上约束底边，画布高度保证所有标签仍有足够空间。
    let top = height - margin + gap;
    for (let index = placed.length - 1; index >= 0; index--) {
      placed[index].y = Math.min(placed[index].y, top - gap - placed[index].height);
      top = placed[index].y;
    }
    return placed.map((row) => {
      const labelY = row.y + row.height / 2;
      const x = row.side === 1 ? width - labelWidth : 0;
      const anchorX = cx + Math.sin(row.angle) * outer;
      const anchorY = cy - Math.cos(row.angle) * outer;
      const elbowX = cx + Math.sin(row.angle) * (outer + 8);
      const elbowY = cy - Math.cos(row.angle) * (outer + 8);
      const railX = cx + row.side * (outer + gutter * 0.6);
      const endX = row.side === 1 ? x - 3 : x + labelWidth + 3;
      return {
        ...row,
        x,
        width: labelWidth,
        points: `${anchorX},${anchorY} ${elbowX},${elbowY} ${railX},${labelY} ${endX},${labelY}`,
      };
    });
  });
  return { width, height, cx, cy, outer, inner: outer * 0.65, labels };
}
