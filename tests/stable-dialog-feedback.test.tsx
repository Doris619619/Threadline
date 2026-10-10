/** @fileoverview 验证两类共用弹窗在异步保存时保持正文和草稿稳定，并继续锁定关闭与展示失败。 */
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { SpaceDialog } from '@/features/together/dialog';

/** JSDOM 只模拟原生模态的 open 状态；真实焦点隔离仍由浏览器验证。 */
function showTestDialog(this: HTMLDialogElement) {
  this.open = true;
}

/** 模拟卸载时关闭原生模态，避免把布局测试能力混入单测。 */
function closeTestDialog(this: HTMLDialogElement) {
  this.open = false;
}

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: showTestDialog },
    close: { configurable: true, value: closeTestDialog },
  });
});
afterEach(cleanup);

for (const kind of ['management', 'space'] as const) {
  it(`${kind} dialog locks pending writes without inserting transient content and retains a failed draft`, () => {
    const close = vi.fn();
    /** 使用同一弹窗实例切换请求状态，验证输入节点不因忙碌状态重新挂载。 */
    const content = (busy: boolean, error?: string) => {
      const fields = (
        <fieldset disabled={busy}>
          <label>
            名称
            <input defaultValue="原名称" />
          </label>
          <button type="submit">保存</button>
        </fieldset>
      );
      return kind === 'management' ? (
        <ManagementDialog title="编辑名称" busy={busy} error={error} onClose={close}>
          {fields}
        </ManagementDialog>
      ) : (
        <SpaceDialog title="编辑名称" busy={busy} error={error} onClose={close}>
          {fields}
        </SpaceDialog>
      );
    };
    const view = render(content(false));
    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByRole('textbox');
    fireEvent.change(field, { target: { value: '保留草稿' } });
    const bodyBefore = dialog.textContent;

    view.rerender(content(true));
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(dialog.textContent).toBe(bodyBefore);
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
    expect(field).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '关闭' })).toBeDisabled();
    if (kind === 'management') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(close).not.toHaveBeenCalled();

    view.rerender(content(false, '网络断开，请重试'));
    expect(dialog).toHaveAttribute('aria-busy', 'false');
    expect(within(dialog).getByRole('textbox')).toBe(field);
    expect(field).toHaveValue('保留草稿');
    expect(field).not.toBeDisabled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('网络断开，请重试');
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
  });
}
