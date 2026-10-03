/** @fileoverview 验证本地状态只水合一次，并按账号接收跨标签删除且不回写旧值。 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { LocalStorageStateRepository } from '@/lib/repository';
import { workspaceStorageKey } from '@/lib/workspace-runtime';

const sharedKey = 'threadline.task-timers.test:owner';

/** 用真实 localStorage 检查跨标签变更，避免 mock 仓储漏掉浏览器同步边界。 */
function SharedStateProbe({ synchronizeTabs = true }: { synchronizeTabs?: boolean }) {
  const [value, setValue, hydrated] = usePersistentState<string[]>(
    sharedKey,
    [],
    (stored) =>
      Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [],
    { synchronizeTabs },
  );
  return (
    <>
      <output data-testid="shared-value">
        {hydrated ? value.join(',') || 'empty' : 'loading'}
      </output>
      <button onClick={() => setValue((current) => [...current, 'new'])}>append</button>
    </>
  );
}

function InlineNormalizerProbe() {
  const [value, , hydrated] = usePersistentState<string[]>(
    'threadline.inline-normalizer.test',
    [],
    (stored) =>
      Array.isArray(stored)
        ? [...new Set(stored.filter((item) => typeof item === 'string'))]
        : [],
  );
  return (
    <output data-testid="persistent-value">
      {hydrated ? value.join(',') : 'loading'}
    </output>
  );
}

describe('usePersistentState', () => {
  it('receives the latest owner value without echoing a stale storage event', async () => {
    const key = workspaceStorageKey(sharedKey);
    localStorage.setItem(key, JSON.stringify(['old']));
    const rendered = render(<SharedStateProbe />);
    await screen.findByText('old');
    const write = vi.spyOn(LocalStorageStateRepository.prototype, 'write');
    localStorage.setItem(key, JSON.stringify([]));
    act(() =>
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: '["old"]' })),
    );
    await screen.findByText('empty');
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('append'));
    await screen.findByText('new');
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['new']);
    rendered.unmount();
    write.mockRestore();
    localStorage.removeItem(key);
  });

  it('ignores another owner and reconciles deletion before a pending local action', async () => {
    const key = workspaceStorageKey(sharedKey);
    localStorage.setItem(key, '["old"]');
    const rendered = render(<SharedStateProbe />);
    await screen.findByText('old');
    localStorage.setItem(key, '[]');
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: workspaceStorageKey(sharedKey + '-other') }),
      ),
    );
    expect(screen.getByTestId('shared-value')).toHaveTextContent('old');
    // storage 事件还未送达时，本机操作也必须以最新持久化值为基准。
    fireEvent.click(screen.getByText('append'));
    await screen.findByText('new');
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['new']);
    rendered.unmount();
    localStorage.removeItem(key);
  });

  it('reconciles on focus, normalizes external values, and handles removed keys', async () => {
    const key = workspaceStorageKey(sharedKey);
    localStorage.setItem(key, '["old"]');
    const rendered = render(<SharedStateProbe />);
    await screen.findByText('old');
    localStorage.setItem(key, '["fresh", 2]');
    act(() => window.dispatchEvent(new Event('focus')));
    await screen.findByText('fresh');
    localStorage.removeItem(key);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
    await screen.findByText('empty');
    expect(localStorage.getItem(key)).toBeNull();
    rendered.unmount();
  });

  it('keeps other local preferences unchanged unless tab synchronization is enabled', async () => {
    const key = workspaceStorageKey(sharedKey);
    localStorage.setItem(key, '["old"]');
    const rendered = render(<SharedStateProbe synchronizeTabs={false} />);
    await screen.findByText('old');
    localStorage.setItem(key, '[]');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
    await waitFor(() =>
      expect(screen.getByTestId('shared-value')).toHaveTextContent('old'),
    );
    rendered.unmount();
    localStorage.removeItem(key);
  });
  it('does not rehydrate repeatedly when an inline normalizer returns a new array', async () => {
    window.localStorage.setItem(
      'threadline.inline-normalizer.test',
      JSON.stringify(['one', 'one', 'two']),
    );
    const read = vi.spyOn(LocalStorageStateRepository.prototype, 'read');

    render(<InlineNormalizerProbe />);

    await expect(screen.findByText('one,two')).resolves.toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);

    read.mockRestore();
    window.localStorage.removeItem('threadline.inline-normalizer.test');
  });
});
