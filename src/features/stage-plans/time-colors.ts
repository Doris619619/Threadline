/** @fileoverview 圆环、引线和明细共用低饱和项目色，仅调整展示，不修改项目原始颜色。 */

/** 保留项目色相，混入中性色与当前主题表面，让深浅主题使用同一套柔和色阶。 */
export function softTimeColor(color: string): string {
  return `color-mix(in oklab, color-mix(in oklab, ${color} 76%, var(--text-secondary)) 66%, var(--surface))`;
}
