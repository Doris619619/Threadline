/** @fileoverview 验证异步重试错误、并发反馈版本与字体选择的稳定性，使用受控请求。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMutationFeedback } from '@/lib/mutation-feedback';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { AppearancePanel } from '@/features/appearance/appearance-panel';
import type { AppearancePreferences } from '@/features/appearance/appearance-preferences';

const appearance = vi.hoisted(() => ({
  value: {
    theme: 'blue',
    font: 'default',
    colorMode: 'light',
  } as AppearancePreferences,
  load: vi.fn(),
  save: vi.fn(),
  apply: vi.fn(),
}));
vi.mock('@/features/appearance/appearance-store', () => ({
  useAppearance: () => appearance.value,
  getAppearance: () => appearance.value,
  loadAppearanceFont: appearance.load,
  saveAppearance: appearance.save,
  applyFontResult: appearance.apply,
}));

/** 控制成功与失败时机，断言请求结束之前的真实组件状态。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  appearance.value = { theme: 'blue', font: 'default', colorMode: 'light' };
  appearance.load.mockResolvedValue(undefined);
  appearance.save.mockImplementation((value: AppearancePreferences) => {
    appearance.value = value;
    return true;
  });
});
afterEach(cleanup);

it('keeps newer failures until a request started after that failure confirms', () => {
  const report = vi.fn();
  const feedback = createMutationFeedback(report);
  feedback.report('旧错误');
  const olderConfirmation = feedback.begin();
  expect(report).toHaveBeenLastCalledWith('旧错误');
  feedback.report('新错误');
  olderConfirmation();
  expect(report).toHaveBeenLastCalledWith('新错误');
  feedback.begin()();
  expect(report).toHaveBeenLastCalledWith(undefined);
});

it('keeps an error during guarded retries while blocking repeated submissions', async () => {
  const { result } = renderHook(useGuardedAction);
  await act(() =>
    result.current.run(async () => {
      throw new Error('网络失败');
    }),
  );
  const request = deferred();
  const retry = vi.fn(() => request.promise);
  let completion!: Promise<void>;
  act(() => {
    completion = result.current.run(retry);
    void result.current.run(retry);
  });
  expect(retry).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBe(true);
  expect(result.current.error).toBe('网络失败');
  await act(async () => {
    request.reject(new Error('网络仍失败'));
    await completion;
  });
  expect(result.current.error).toBe('网络仍失败');
  await act(() => result.current.run(async () => undefined));
  expect(result.current.error).toBeUndefined();
});

it('keeps font failure text throughout retry and ignores an older successful choice', async () => {
  render(<AppearancePanel />);
  await waitFor(() =>
    expect(document.querySelector('.appearance-font-options')).toHaveAttribute(
      'aria-busy',
      'false',
    ),
  );
  expect(screen.queryByText('正在加载字体预览…')).toBeNull();
  const older = deferred();
  const newer = deferred();
  appearance.load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const choose = screen.getByRole('button', { name: /思源黑体/ });
  fireEvent.click(choose);
  fireEvent.click(choose);
  await act(async () => newer.reject(new Error('不可用')));
  expect(screen.getByRole('status')).toHaveTextContent('字体未能加载');
  await act(async () => older.resolve());
  expect(screen.getByRole('status')).toHaveTextContent('字体未能加载');
  const retry = deferred();
  appearance.load.mockReturnValueOnce(retry.promise);
  fireEvent.click(choose);
  expect(screen.getByRole('status')).toHaveTextContent('字体未能加载');
  await act(async () => retry.resolve());
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('does not erase a persistence failure when the chosen font loads successfully', async () => {
  render(<AppearancePanel />);
  await waitFor(() =>
    expect(document.querySelector('.appearance-font-options')).toHaveAttribute(
      'aria-busy',
      'false',
    ),
  );
  appearance.save.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: /思源黑体/ }));
  await waitFor(() => expect(appearance.apply).toHaveBeenCalled());
  expect(screen.getByRole('status')).toHaveTextContent('当前无法保存设置');
});
