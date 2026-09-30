/** @fileoverview 验证表单区分未发送、明确拒绝和未知结果；离线重试不能解除更早请求的保护。 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSpaceCommand } from '@/features/together/use-command';
import {
  RejectedSpaceCommand,
  UnsentSpaceCommand,
} from '@/features/together/repository';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/features/together/state', () => ({ useTogether: () => ({ run }) }));
beforeEach(() => run.mockReset());

it.each([UnsentSpaceCommand, RejectedSpaceCommand])(
  'allows corrected content after %s',
  async (Failure) => {
    run
      .mockRejectedValueOnce(new Failure('请重试'))
      .mockResolvedValueOnce({ saved: true });
    const { result } = renderHook(useSpaceCommand);
    await act(async () => {
      await result.current.submit('create_flag', { title: '50' });
    });
    const firstId = run.mock.calls[0][0].id;
    await act(async () => {
      await result.current.submit('create_flag', { title: '60' });
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0]).toMatchObject({ payload: { title: '60' } });
    expect(run.mock.calls[1][0].id).not.toBe(firstId);
    expect(result.current.error).toBe('');
  },
);

it('retains the original ID after an unknown result followed by an offline retry', async () => {
  run
    .mockRejectedValueOnce(new Error('timeout'))
    .mockRejectedValueOnce(new UnsentSpaceCommand('offline'))
    .mockResolvedValueOnce({ saved: true });
  const { result } = renderHook(useSpaceCommand);
  await act(async () => {
    await result.current.submit('create_flag', { title: '50' });
  });
  const original = run.mock.calls[0][0];
  await act(async () => {
    await result.current.submit('create_flag', { title: '50' });
  });
  await act(async () => {
    await result.current.submit('create_flag', { title: '60' });
  });
  expect(run).toHaveBeenCalledTimes(2);
  expect(result.current.error).toContain('上次提交结果尚未确认');
  await act(async () => {
    await result.current.submit('create_flag', { title: '50' });
  });
  expect(run.mock.calls[2][0]).toEqual(original);
  expect(result.current.error).toBe('');
});
