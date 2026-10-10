/** @fileoverview 用延迟写入验证个人设置和经期表单保持操作名称、失败反馈及重试草稿。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PersonalPreferencesSettings } from '@/features/settings/personal-preferences-settings';
import { AccountTimezoneSettings } from '@/features/settings/account-timezone-settings';
import { PeriodEditor } from '@/features/rhythm/period-editor';
import { SettingsPanel } from '@/features/settings/settings-panel';

const mocks = vi.hoisted(() => ({
  preferencesSave: vi.fn(),
  timezoneSave: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => ({
    user: { id: 'settings-test', email: 'test@example.com', user_metadata: {} },
    signOut: mocks.signOut,
  }),
}));
vi.mock('@/lib/desktop-window-context', () => ({
  useDesktopWindow: () => ({ isNativeDesktop: false, mode: 'full' }),
}));
vi.mock('@/features/onboarding/account-preferences-provider', () => ({
  useAccountPreferences: () => ({
    profile: { gender: 'female' },
    save: mocks.preferencesSave,
  }),
}));
vi.mock('@/features/settings/account-timezone-provider', () => ({
  useAccountTimezone: () => ({
    settings: { timezone: 'UTC', version: 0 },
    saveTimezone: mocks.timezoneSave,
  }),
}));

/** 控制真正响应时间，让断言覆盖失败后重试的等待阶段。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

for (const kind of ['gender', 'timezone'] as const) {
  it(`${kind} keeps the action name and failure visible until retry confirms`, async () => {
    const first = deferred();
    const retry = deferred();
    const save = kind === 'gender' ? mocks.preferencesSave : mocks.timezoneSave;
    save.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
    render(
      kind === 'gender' ? <PersonalPreferencesSettings /> : <AccountTimezoneSettings />,
    );
    if (kind === 'gender') fireEvent.click(screen.getByLabelText('男生'));
    else
      fireEvent.change(screen.getByLabelText('账号时区'), {
        target: { value: 'Asia/Shanghai' },
      });
    const name = kind === 'gender' ? '保存' : '保存时区';
    const button = screen.getByRole('button', { name, exact: true });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/保存中|正在保存/)).toBeNull();
    await act(async () => first.reject(new Error('timeout')));
    const error = screen.getByText('timeout');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name, exact: true })).toBe(button);
    expect(error).toBeVisible();
    if (kind === 'gender') expect(screen.getByLabelText('男生')).toBeChecked();
    else expect(screen.getByLabelText('账号时区')).toHaveValue('Asia/Shanghai');
    await act(async () => retry.resolve());
    await waitFor(() => expect(screen.queryByText('timeout')).toBeNull());
    expect(save).toHaveBeenCalledTimes(2);
  });
}

it('keeps a timezone confirmation visible when saving the same value again', async () => {
  mocks.timezoneSave.mockResolvedValueOnce(undefined);
  render(<AccountTimezoneSettings />);
  const button = screen.getByRole('button', { name: '保存时区' });
  fireEvent.click(button);
  const confirmation = await screen.findByText('已保存，所有页面使用此时区。');
  const repeat = deferred();
  mocks.timezoneSave.mockReturnValueOnce(repeat.promise);
  fireEvent.click(button);
  expect(confirmation).toBeVisible();
  expect(button).toBeDisabled();
  await act(async () => repeat.resolve());
  expect(screen.getByText('已保存，所有页面使用此时区。')).toBe(confirmation);
});

it('locks a period save once and retains both dates and failure feedback during retry', async () => {
  const first = deferred();
  const retry = deferred();
  const save = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise);
  const close = vi.fn();
  render(
    <PeriodEditor
      initial={{ id: 'draft', startDate: '2026-10-01' }}
      title="记录开始"
      today="2026-10-10"
      existing={false}
      onSave={save}
      onDelete={vi.fn()}
      onClose={close}
    />,
  );
  fireEvent.change(screen.getByLabelText('开始日期'), {
    target: { value: '2026-10-02' },
  });
  const button = screen.getByRole('button', { name: '保存', exact: true });
  act(() => {
    button.click();
    button.click();
  });
  expect(save).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  expect(screen.queryByText(/保存中|正在保存/)).toBeNull();
  await act(async () => first.reject(new Error('timeout')));
  const error = screen.getByText('timeout');
  fireEvent.click(button);
  expect(error).toBeVisible();
  expect(screen.getByLabelText('开始日期')).toHaveValue('2026-10-02');
  expect(close).not.toHaveBeenCalled();
  await act(async () => retry.resolve());
  expect(close).toHaveBeenCalledOnce();
});

it('keeps logout stable and preserves a previous failure until retry succeeds', async () => {
  const first = deferred();
  const retry = deferred();
  mocks.signOut.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  render(<SettingsPanel tasks={[]} onUpdateTask={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /隐私/ }));
  const button = screen.getByRole('button', { name: '退出登录' });
  act(() => {
    button.click();
    button.click();
  });
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(button).toHaveTextContent('退出登录');
  expect(button).toBeDisabled();
  await act(async () => first.reject(new Error('logout failed')));
  const error = screen.getByText('logout failed');
  fireEvent.click(button);
  expect(error).toBeVisible();
  expect(screen.queryByText('正在退出…')).toBeNull();
  await act(async () => retry.resolve());
  expect(screen.queryByText('logout failed')).toBeNull();
});
