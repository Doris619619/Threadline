/** @fileoverview 统一中文等组合输入的快捷键边界，兼容候选确认事件码 229。 */
import type { CompositionEvent, KeyboardEvent } from 'react';
const composing = new WeakSet<EventTarget>();
export const compositionHandlers = {
  /** 记录浏览器未可靠提供 isComposing 时的真实组字状态。 */
  onCompositionStart: (event: CompositionEvent) => {
    composing.add(event.target);
  },
  /** 候选确认完成后恢复普通键盘提交。 */
  onCompositionEnd: (event: CompositionEvent) => {
    composing.delete(event.target);
  },
};
/** 正在组字的 Enter 只能确认候选，不得触发业务保存。 */
export function isComposingInput(event: KeyboardEvent): boolean {
  return (
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229 ||
    composing.has(event.target)
  );
}
