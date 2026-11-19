/** @fileoverview 用实际菜单共用的定位函数验证长菜单、屏幕边缘及软键盘视口不会遮住可见锚点。 */
import { describe, expect, it } from 'vitest';
import { positionPopover } from '@/components/ui/popover-position';

const viewport = { left: 0, top: 0, width: 320, height: 600 };
const anchor = { left: 200, right: 300, top: 250, bottom: 294 };

describe('anchored popover geometry', () => {
  it('limits a long menu to the larger lower side instead of covering the trigger', () => {
    const position = positionPopover({
      anchor,
      viewport,
      menu: { width: 220, height: 800 },
    });
    expect(position.upward).toBe(false);
    expect(position.top).toBe(298);
    expect(position.maxHeight).toBe(294);
    expect(position.top).toBeGreaterThan(anchor.bottom);
    expect(position.top + position.maxHeight).toBe(592);
  });

  it('flips a long menu upward and constrains its scroll height near the lower screen edge', () => {
    const edgeAnchor = { ...anchor, top: 480, bottom: 524 };
    const position = positionPopover({
      anchor: edgeAnchor,
      viewport,
      menu: { width: 220, height: 800 },
    });
    expect(position.upward).toBe(true);
    expect(position.maxHeight).toBe(468);
    expect(position.top).toBe(8);
    expect(position.top + position.maxHeight).toBeLessThan(edgeAnchor.top);
  });

  it('uses the lower side when a short menu fits, preserving natural height', () => {
    const position = positionPopover({
      anchor,
      viewport,
      menu: { width: 220, height: 100 },
    });
    expect(position.upward).toBe(false);
    expect(position.top).toBe(298);
    expect(position.top + 100).toBeLessThan(600);
  });

  it('honors offset visible viewports and the picker spacing while limiting horizontal bounds', () => {
    const position = positionPopover({
      anchor: { left: 290, right: 334, top: 240, bottom: 284 },
      viewport: { left: 20, top: 100, width: 320, height: 240 },
      menu: { width: 300, height: 320 },
      align: 'start',
      margin: 12,
      gap: 6,
    });
    expect(position.upward).toBe(true);
    expect(position.top).toBe(112);
    expect(position.maxHeight).toBe(122);
    expect(position.left).toBe(32);
    expect(position.maxWidth).toBe(296);
  });

  it('places a right-click menu above a point close to the viewport bottom', () => {
    const position = positionPopover({
      anchor,
      viewport,
      menu: { width: 220, height: 700 },
      point: { x: 315, y: 580 },
    });
    expect(position.upward).toBe(true);
    expect(position.left).toBe(92);
    expect(position.top).toBe(8);
    expect(position.maxHeight).toBe(568);
  });

  it('falls back inside the visible viewport only when the anchor is offscreen', () => {
    const position = positionPopover({
      anchor: { ...anchor, top: 700, bottom: 744 },
      viewport,
      menu: { width: 220, height: 800 },
    });
    expect(position.top).toBe(8);
    expect(position.maxHeight).toBe(584);
  });

  it('keeps a keyboard context menu above the focused control instead of overlapping its height', () => {
    const position = positionPopover({
      anchor,
      viewport,
      menu: { width: 220, height: 700 },
      point: { x: 200, y: 524, anchorTop: 480 },
    });
    expect(position.upward).toBe(true);
    expect(position.top + position.maxHeight).toBe(476);
  });
});
