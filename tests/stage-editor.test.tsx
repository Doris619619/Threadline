/** @fileoverview 验证连续新增清单、中文 Enter、零任务以及失败重试的稳定草稿身份。 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StageEditor } from '@/features/stage-plans/editor';
const commands = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('@/features/stage-plans/state', () => ({ useStagePlans: () => commands }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  commands.create.mockResolvedValue({ id: 'ok' });
});
/** 使用现有表单控件填写最低必要字段。 */
function fillName() {
  fireEvent.change(screen.getByLabelText('阶段名称'), {
    target: { value: '国庆假期' },
  });
}
it('adds many items through Enter and commits a final unsubmitted line in one transaction', async () => {
  render(<StageEditor onClose={vi.fn()} />);
  fillName();
  const input = screen.getByLabelText('阶段任务名称');
  for (let i = 0; i < 16; i++) {
    fireEvent.change(input, { target: { value: '任务' + i } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  }
  fireEvent.change(input, { target: { value: '最后一项' } });
  fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));
  await waitFor(() => expect(commands.create).toHaveBeenCalledTimes(1));
  const draft = commands.create.mock.calls[0][0];
  expect(draft.tasks).toHaveLength(17);
  expect(new Set(draft.tasks.map((item: { id: string }) => item.id)).size).toBe(17);
  expect(draft.tasks.every((item: object) => !('date' in item))).toBe(true);
});
it('does not treat Chinese composition Enter as an add or submit action', () => {
  render(<StageEditor onClose={vi.fn()} />);
  const input = screen.getByLabelText('阶段任务名称');
  fireEvent.change(input, { target: { value: '词语' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(input).toHaveValue('词语');
  expect(commands.create).not.toHaveBeenCalled();
});
it('allows an empty initial checklist and preserves IDs/input after failed submit', async () => {
  commands.create.mockRejectedValueOnce(new Error('网络失败'));
  const close = vi.fn();
  render(<StageEditor onClose={close} />);
  fillName();
  fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));
  await screen.findByText('网络失败');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(commands.create.mock.calls[0][0]).toEqual(commands.create.mock.calls[1][0]);
  expect(commands.create.mock.calls[0][0].tasks).toEqual([]);
});
