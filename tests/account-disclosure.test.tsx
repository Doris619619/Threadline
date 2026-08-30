/** @fileoverview 覆盖账户 disclosure 的标准关闭路径和真实退出状态。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountDisclosure } from '@/features/auth/account-disclosure';

const identity = {
  displayName: 'Doris',
  email: 'doris@example.com',
  avatarLabel: 'D',
};

afterEach(cleanup);

describe('AccountDisclosure', () => {
  /** Escape 关闭普通 disclosure 并把键盘焦点还给触发器。 */
  it('closes on Escape and restores trigger focus without menu roles', () => {
    render(
      <AccountDisclosure
        identity={identity}
        onOpenSettings={vi.fn()}
        signOut={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: /Doris/ });
    fireEvent.click(trigger);
    expect(screen.getByLabelText('账户选项')).not.toHaveAttribute('role', 'menu');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('账户选项')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  /** 外部点击关闭，退出进行中禁用重复提交，失败保留可恢复反馈。 */
  it('closes on outside click and surfaces a recoverable sign-out error', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('网络暂不可用'));
    render(
      <>
        <AccountDisclosure
          identity={identity}
          onOpenSettings={vi.fn()}
          signOut={signOut}
        />
        <button type="button">外部</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Doris/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: '外部' }));
    expect(screen.queryByLabelText('账户选项')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Doris/ }));
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(screen.getByRole('button', { name: '正在退出…' })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('网络暂不可用'),
    );
  });
});
