/** @fileoverview 验证首页 Daily 常显、完成联动、输入保存次序及失败草稿恢复。 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyPanel } from '@/features/daily/daily-panel';
import type { Daily } from '@/features/daily/types';

const daily: Daily = {
  id: 'study',
  entryId: 'entry',
  title: '算法训练',
  actual: 0,
  completed: false,
  result: '',
  children: [
    {
      id: 'one',
      title: '完成一道动态规划题并整理思路',
      actual: 0,
      completed: false,
      plannedDurationMinutes: 30,
    },
    {
      id: 'two',
      title: '复盘昨天的错题',
      actual: 0,
      completed: false,
      plannedDurationMinutes: 20,
    },
  ],
};

afterEach(cleanup);

/** 使用可控制的真实异步边界渲染执行面板，保留所有用户可见控件。 */
function setup(onSave = vi.fn().mockResolvedValue(undefined), item = daily) {
  const view = render(<DailyPanel items={[item]} date="2026-09-05" onSave={onSave} />);
  return { ...view, onSave };
}

describe('Daily home execution', () => {
  it('shows every child and actual field without a result form or disclosure', () => {
    setup();
    expect(screen.getByText(daily.children[0].title)).toBeVisible();
    expect(screen.getByText('预计 30 分钟')).toBeVisible();
    expect(screen.getByText('预计 50 分钟')).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('今日结果')).toBeNull();
    expect(screen.queryByRole('button', { name: /记录/ })).toBeNull();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(screen.queryByLabelText('算法训练实际耗时')).toBeNull();
    expect(screen.queryByRole('button', { name: /展开|详情|收起/ })).toBeNull();
  });

  it('saves a child and its completed parent atomically, then undoes all checks without deleting minutes', async () => {
    const { onSave } = setup();
    fireEvent.change(
      screen.getByLabelText('算法训练 ' + daily.children[0].title + '实际耗时'),
      { target: { value: '12' } },
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: '完成 ' + daily.children[0].title }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          completed: true,
          children: expect.arrayContaining([
            expect.objectContaining({ actual: 12, completed: true }),
          ]),
        }),
        '2026-09-05',
      ),
    );
    const parent = screen.getByRole('checkbox', { name: '完成 Daily 算法训练' });
    await waitFor(() => expect(parent).toBeEnabled());
    expect(parent).toBeChecked();
    fireEvent.click(parent);
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({
          completed: false,
          children: expect.arrayContaining([
            expect.objectContaining({ actual: 12, completed: false }),
          ]),
        }),
        '2026-09-05',
      ),
    );
  });

  it('preserves new typing during an in-flight save and saves the latest draft while preserving existing results', async () => {
    let release!: () => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    setup(onSave, { ...daily, result: '已有历史结果' });
    const input = screen.getByLabelText(
      '算法训练 ' + daily.children[0].title + '实际耗时',
    );
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.blur(input);
    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({
          result: '已有历史结果',
          children: expect.arrayContaining([expect.objectContaining({ actual: 15 })]),
        }),
        '2026-09-05',
      ),
    );
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue(15);
  });

  it('keeps failed drafts through a cloud refresh and retries them explicitly', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValue(undefined);
    const { rerender } = setup(onSave);
    const input = screen.getByLabelText(
      '算法训练 ' + daily.children[0].title + '实际耗时',
    );
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);
    await screen.findByRole('alert');
    rerender(<DailyPanel items={[{ ...daily }]} date="2026-09-05" onSave={onSave} />);
    expect(input).toHaveValue(25);
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        children: expect.arrayContaining([expect.objectContaining({ actual: 25 })]),
      }),
      '2026-09-05',
    );
  });

  it('rejects negative minutes without writing and allows direct completion without any minutes', async () => {
    const { onSave } = setup(undefined, { ...daily, children: [] });
    const input = screen.getByLabelText('算法训练实际耗时');
    fireEvent.change(input, { target: { value: '-2' } });
    fireEvent.blur(input);
    await screen.findByRole('alert');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '完成 Daily 算法训练' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ completed: true, actual: 0 }),
        '2026-09-05',
      ),
    );
  });
});
