/** @fileoverview 计算锚点浮层的方向、可滚动高度和视口边界，供菜单与项目选择器共用。 */

type Bounds = { left: number; top: number; right: number; bottom: number };
type Viewport = { left: number; top: number; width: number; height: number };

/**
 * 先选能容纳菜单或空间更大的一侧，再限制高度；不通过整体夹紧覆盖仍可见的触发器。
 * 完全离屏的锚点或没有任何侧边空间时，回退到视口内可滚动浮层。
 */
export function positionPopover({
  anchor,
  viewport,
  menu,
  align = 'end',
  point,
  margin = 8,
  gap = 4,
}: {
  anchor: Bounds;
  viewport: Viewport;
  menu: { width: number; height: number };
  align?: 'start' | 'end';
  point?: { x: number; y: number; anchorTop?: number };
  margin?: number;
  gap?: number;
}) {
  const topEdge = viewport.top + margin;
  const bottomEdge = viewport.top + viewport.height - margin;
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(menu.width, maxWidth);
  const anchorTop = point?.anchorTop ?? point?.y ?? anchor.top;
  const anchorBottom = point?.y ?? anchor.bottom;
  const below = Math.max(0, bottomEdge - anchorBottom - gap);
  const above = Math.max(0, anchorTop - topEdge - gap);
  const offscreen = anchorBottom < topEdge || anchorTop > bottomEdge;
  const fallback = offscreen || Math.max(below, above) === 0;
  const upward = menu.height > below && (menu.height <= above || above > below);
  const maxHeight = fallback
    ? Math.max(0, viewport.height - margin * 2)
    : upward
      ? above
      : below;
  const height = Math.min(menu.height, maxHeight);
  const desiredTop = upward ? anchorTop - gap - height : anchorBottom + gap;
  const desiredLeft =
    point?.x ?? (align === 'start' ? anchor.left : anchor.right - width);
  return {
    top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - height)),
    left: Math.max(
      viewport.left + margin,
      Math.min(desiredLeft, viewport.left + viewport.width - width - margin),
    ),
    maxHeight,
    maxWidth,
    upward,
  };
}
