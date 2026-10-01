/** @fileoverview 阶段短表单读取可见视口；手机键盘弹出时按剩余高度定位弹窗，不覆盖输入和确认区。 */
'use client';
import { useSyncExternalStore, type CSSProperties } from 'react';

/** 浏览器旋转、地址栏和软键盘均可能改变可见区域，卸载时完整移除订阅。 */
function subscribeViewport(change: () => void) {
  window.addEventListener('resize', change);
  window.visualViewport?.addEventListener('resize', change);
  window.visualViewport?.addEventListener('scroll', change);
  return () => {
    window.removeEventListener('resize', change);
    window.visualViewport?.removeEventListener('resize', change);
    window.visualViewport?.removeEventListener('scroll', change);
  };
}
/** 原始字符串保持快照稳定；软键盘不改变设备布局宽度，只改变可见高度和偏移。 */
function viewportSnapshot() {
  return [
    window.innerWidth,
    window.visualViewport?.height ?? window.innerHeight,
    window.visualViewport?.offsetTop ?? 0,
  ].join(':');
}
/** 服务端不猜测设备；首屏通过 CSS 保持上限，客户端再订阅真实可见区域。 */
function serverViewport() {
  return '0:0:0';
}

/** 只为手机阶段表单提供可见区域，其他管理弹窗继续使用原来的定位。 */
export function useStageEditorViewport() {
  const [width, height, top] = useSyncExternalStore(
    subscribeViewport,
    viewportSnapshot,
    serverViewport,
  )
    .split(':')
    .map(Number);
  const mobile = width > 0 && width <= 760;
  const backdropStyle: CSSProperties | undefined = mobile
    ? ({
        top,
        bottom: 'auto',
        height,
        '--stage-editor-viewport-height': height + 'px',
      } as CSSProperties)
    : undefined;
  return { mobile, backdropStyle };
}
