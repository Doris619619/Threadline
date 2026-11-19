/** @fileoverview 验证任务菜单在非文字控件上可用，且为本窗口和异窗口编辑区保留原生菜单。 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTaskMenu } from '@/features/tasks/hooks/use-task-menu';

afterEach(cleanup);

/** 把真实 hook 接到任务行；菜单状态由 DOM 呈现，不替换事件处理器。 */
function TaskMenuHarness() {
  const menu = useTaskMenu();
  return (
    <div onContextMenu={menu.onContextMenu} onKeyDown={menu.onKeyDown}>
      <input aria-label="完成任务" type="checkbox" />
      <input aria-label="选中任务" type="radio" />
      <input aria-label="任务名称" type="text" />
      <input aria-label="任务日期" type="date" />
      <textarea aria-label="任务说明" />
      <select aria-label="任务项目">
        <option>项目</option>
      </select>
      <div aria-label="富文本说明" contentEditable suppressContentEditableWarning>
        <span>可编辑文字</span>
      </div>
      {menu.open && <div role="menu" aria-label="任务操作" />}
    </div>
  );
}

it.each(['完成任务', '选中任务'])(
  'allows keyboard and pointer task menus from the non-text control %s',
  (label) => {
    for (const event of ['shift-f10', 'menu-key', 'context-menu']) {
      const view = render(<TaskMenuHarness />);
      const control = view.getByLabelText(label);
      control.focus();
      const native =
        event === 'context-menu'
          ? fireEvent.contextMenu(control, { clientX: 20, clientY: 30 })
          : fireEvent.keyDown(control, {
              key: event === 'shift-f10' ? 'F10' : 'ContextMenu',
              shiftKey: event === 'shift-f10',
            });
      expect(native).toBe(false);
      expect(view.getByRole('menu', { name: '任务操作' })).toBeVisible();
      view.unmount();
    }
  },
);

it.each(['任务名称', '任务日期', '任务说明', '任务项目', '富文本说明'])(
  'preserves native keyboard and pointer menus in the editing control %s',
  (label) => {
    const view = render(<TaskMenuHarness />);
    const editor = view.getByLabelText(label);
    // 富文本的后代同样属于编辑区，不能被任务行菜单截走。
    const target = editor.firstElementChild ?? editor;
    expect(fireEvent.keyDown(target, { key: 'F10', shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(target, { key: 'ContextMenu' })).toBe(true);
    expect(fireEvent.contextMenu(target, { clientX: 20, clientY: 30 })).toBe(true);
    expect(view.queryByRole('menu')).toBeNull();
  },
);

it('preserves native menus for editors owned by another window', () => {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  try {
    const frameDocument = frame.contentDocument!;
    const container = frameDocument.createElement('div');
    frameDocument.body.appendChild(container);
    const view = render(<TaskMenuHarness />, {
      container,
      baseElement: frameDocument.body,
    });
    for (const label of ['任务名称', '任务日期', '任务说明', '富文本说明']) {
      const editor = view.getByLabelText(label);
      expect(editor.ownerDocument).toBe(frameDocument);
      expect(editor instanceof Element).toBe(false);
      const target = editor.firstElementChild ?? editor;
      expect(fireEvent.keyDown(target, { key: 'F10', shiftKey: true })).toBe(true);
      expect(fireEvent.keyDown(target, { key: 'ContextMenu' })).toBe(true);
      expect(fireEvent.contextMenu(target)).toBe(true);
      expect(view.queryByRole('menu')).toBeNull();
    }
    view.unmount();
  } finally {
    frame.remove();
  }
});
