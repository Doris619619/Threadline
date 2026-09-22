/** @fileoverview 验证历史收尾默认今天，拒绝过去与原日期，并遵从账号时区。 */
import { createRef } from 'react';
import { cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CloseDialog } from '@/features/tasks/components/task-dialogs';
import { useCloseDay } from '@/features/tasks/hooks/use-close-day';
import { setAccountTimezone } from '@/lib/account-clock';
import type { Task } from '@/types/domain';
const task: Task = {
  id: 't',
  title: '历史事项',
  projectId: 'p',
  date: '2026-09-19',
  completed: false,
  status: 'active',
  importance: 'normal',
  createdAt: '',
  updatedAt: '',
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setAccountTimezone(undefined);
});
it('N10 disables a past tomorrow and defaults the historical close to today', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T00:30:00Z'));
  setAccountTimezone('UTC');
  const view = render(
    <CloseDialog
      dialog={createRef()}
      tasks={[task]}
      actual={0}
      dailyDone={0}
      dailyCount={0}
      dailyActual={0}
      tomorrow="2026-09-20"
      onCloseDay={vi.fn()}
    />,
  );
  expect(view.container.querySelector('option[value="tomorrow"]')).toBeDisabled();
  expect(view.container.querySelector('select')).toHaveValue('date');
  expect(view.container.querySelector('input[type="date"]')).toHaveValue('2026-09-21');
});
it.each(['2026-09-19', '2026-09-20'])(
  'N10 does not issue a close command for invalid date %s',
  async (target) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T00:30:00Z'));
    setAccountTimezone('UTC');
    const closeDay = vi.fn();
    const hook = renderHook(() =>
      useCloseDay({
        closeDay,
        projects: [],
        selectedDate: task.date!,
        shown: [task],
        taskTimeEntries: [],
        taskTimeEntriesAuthoritative: true,
        tomorrow: '2026-09-20',
      }),
    );
    const form = new FormData();
    form.set('action-t', 'date');
    form.set('date-t', target);
    await expect(hook.result.current(form)).rejects.toThrow();
    expect(closeDay).not.toHaveBeenCalled();
  },
);
