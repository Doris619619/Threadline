/** @fileoverview 验证智能导入从杂乱原文到六字段确认的交互，以及逐条保存、防重复和失败重试边界。 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SmartImportDialog } from '@/features/tasks/smart-import/dialog';
import { useSmartImport } from '@/features/tasks/smart-import/use-smart-import';
import {
  parseImportTasks,
  type ParsedImportTask,
} from '@/features/tasks/smart-import/client';
import type { Project, Task } from '@/types/domain';

vi.mock('@/features/tasks/smart-import/client', () => ({
  IMPORT_TEXT_LIMIT: 20_000,
  parseImportTasks: vi.fn(),
}));

const fallbackId = '00000000-0000-4000-8000-000000000001';
const courseId = '00000000-0000-4000-8000-000000000002';
const projects: Project[] = [
  {
    id: fallbackId,
    name: '其他',
    color: '#8793a7',
    status: 'active',
    isFallback: true,
    createdAt: '2026-11-19',
  },
  {
    id: courseId,
    name: '课程',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-11-19',
  },
];

/** 提供合法的解析响应；空选填参数必须原样进入确认草稿。 */
function parsedTask(title = '完成 ECE4016 作业'): ParsedImportTask {
  return {
    title,
    projectId: courseId,
    startTime: null,
    endTime: null,
    plannedMinutes: null,
    actualMinutes: null,
  };
}

/** 通过显式 resolve/reject 控制网络边界，避免用固定等待时间模拟进度。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** 返回可观察的真实保存依赖；不会用 mock 替代草稿验证或任务构造。 */
function dependencies() {
  return {
    client: {} as SupabaseClient,
    projects,
    selectedDate: '2026-11-23',
    createTask: vi.fn(async (task: Task) => task),
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };
}

/** 通过公开界面进入确认步骤，确保解析按钮是创建草稿的唯一入口。 */
async function openReview(text = '嗯，我今天要完成 ECE4016 的作业。') {
  fireEvent.change(screen.getByLabelText('待解析内容'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
  await screen.findByRole('heading', { name: '确认导入任务' });
}

beforeEach(() => vi.mocked(parseImportTasks).mockReset());
afterEach(cleanup);

describe('智能导入确认流程', () => {
  it('passes messy text intact to AI, shows indeterminate progress and does not save before confirmation', async () => {
    const c = dependencies();
    const parsing = deferred<ParsedImportTask[]>();
    vi.mocked(parseImportTasks).mockReturnValueOnce(parsing.promise);
    render(<SmartImportDialog {...c} />);
    const dialog = screen.getByRole('dialog');
    const text =
      '嗯，就是那个，背景其实不重要。我想想，先把作业交了。'.repeat(120) +
      '\n- [ ] 完成 ECE4016 作业\n对对，不要重复。';
    fireEvent.change(screen.getByLabelText('待解析内容'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
    expect(parseImportTasks).toHaveBeenCalledWith(
      c.client,
      text,
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('progressbar', { name: '正在解析任务' }),
    ).not.toHaveAttribute('value');
    expect(c.createTask).not.toHaveBeenCalled();
    await act(async () => parsing.resolve([parsedTask()]));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByRole('heading', { name: '确认导入任务' })).toBeInTheDocument();
    expect(c.createTask).not.toHaveBeenCalled();
  });

  it('directly edits exactly six task fields and saves their values with the selected date and incomplete defaults', async () => {
    const c = dependencies();
    vi.mocked(parseImportTasks).mockResolvedValueOnce([parsedTask()]);
    render(<SmartImportDialog {...c} />);
    await openReview();
    const row = screen.getByRole('article', { name: '任务 1' });
    const fields = row.querySelector('fieldset');
    expect(fields?.querySelectorAll('input, textarea, select')).toHaveLength(6);
    expect(
      screen.queryByLabelText(/日期|优先级|阶段|完成状态|更多参数/),
    ).not.toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: '任务 1 名称' });
    const project = screen.getByRole('combobox', { name: '任务 1 项目' });
    expect(title).toBeRequired();
    expect(project).toBeRequired();
    for (const name of ['开始时间', '结束时间', '预计时长', '实际耗时'])
      expect(screen.getByRole('textbox', { name: `任务 1 ${name}` })).toHaveValue('');
    const longName = '这是需要保留完整内容并允许编辑的长任务名称'.repeat(8);
    fireEvent.change(title, { target: { value: longName } });
    expect(title).toHaveValue(longName);
    fireEvent.change(project, { target: { value: fallbackId } });
    fireEvent.change(screen.getByLabelText('任务 1 开始时间'), {
      target: { value: '830' },
    });
    fireEvent.change(screen.getByLabelText('任务 1 结束时间'), {
      target: { value: '1000' },
    });
    expect(screen.getByLabelText('任务 1 预计时长')).toHaveValue('90');
    fireEvent.change(screen.getByLabelText('任务 1 预计时长'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('任务 1 实际耗时'), {
      target: { value: '30min' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(c.onSuccess).toHaveBeenCalledWith(1));
    expect(c.createTask).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: longName,
        projectId: fallbackId,
        date: c.selectedDate,
        plannedStartTime: '08:30',
        plannedEndTime: '10:00',
        plannedDurationMinutes: 45,
        actualDurationMinutes: 30,
        completed: false,
        completedAt: undefined,
        status: 'active',
        importance: 'normal',
      }),
    );
  });

  it('imports only checked rows and removes deleted rows without saving either', async () => {
    const c = dependencies();
    vi.mocked(parseImportTasks).mockResolvedValueOnce([
      parsedTask('保留任务'),
      parsedTask('取消勾选任务'),
      parsedTask('删除任务'),
    ]);
    render(<SmartImportDialog {...c} />);
    await openReview();
    fireEvent.click(screen.getByRole('checkbox', { name: '导入任务 2' }));
    fireEvent.click(screen.getByRole('button', { name: '删除任务 3' }));
    expect(screen.queryByDisplayValue('删除任务')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '导入任务 2' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(c.onSuccess).toHaveBeenCalledWith(1));
    expect(c.createTask).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: '保留任务' }),
    );
  });

  it('uses the existing fallback for an unknown AI project and offers only usable projects', async () => {
    const c = dependencies();
    c.projects = [
      ...projects,
      {
        ...projects[1],
        id: 'archived-project',
        name: '已归档项目',
        status: 'archived',
      },
      {
        ...projects[1],
        id: 'deleted-project',
        name: '已删除项目',
        deletedAt: '2026-11-19',
      },
    ];
    vi.mocked(parseImportTasks).mockResolvedValueOnce([
      { ...parsedTask(), projectId: 'unknown-project' },
    ]);
    render(<SmartImportDialog {...c} />);
    await openReview();
    expect(screen.getByRole('combobox', { name: '任务 1 项目' })).toHaveValue(
      fallbackId,
    );
    expect(
      screen.queryByRole('option', { name: '已归档项目' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '已删除项目' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(c.onSuccess).toHaveBeenCalledWith(1));
    expect(c.createTask).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ projectId: fallbackId }),
    );
  });

  it('preserves source text after empty results and service failures and when returning from review', async () => {
    const c = dependencies();
    vi.mocked(parseImportTasks)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('解析服务暂时不可用'))
      .mockResolvedValueOnce([parsedTask()]);
    render(<SmartImportDialog {...c} />);
    const text = '嗯，我得先完成 ECE4016 作业。';
    fireEvent.change(screen.getByLabelText('待解析内容'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '没有识别到需要执行的任务',
    );
    expect(screen.getByLabelText('待解析内容')).toHaveValue(text);
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('解析服务暂时不可用');
    expect(screen.getByLabelText('待解析内容')).toHaveValue(text);
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
    await screen.findByRole('heading', { name: '确认导入任务' });
    fireEvent.click(screen.getByRole('button', { name: '返回修改' }));
    expect(screen.getByLabelText('待解析内容')).toHaveValue(text);
    expect(c.createTask).not.toHaveBeenCalled();
  });

  it('aborts an outstanding parser when the dialog closes and ignores its late result', async () => {
    const c = dependencies();
    const parsing = deferred<ParsedImportTask[]>();
    vi.mocked(parseImportTasks).mockReturnValueOnce(parsing.promise);
    const view = render(<SmartImportDialog {...c} />);
    c.onClose.mockImplementation(() => view.unmount());
    fireEvent.change(screen.getByLabelText('待解析内容'), {
      target: { value: '完成作业' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
    const signal = vi.mocked(parseImportTasks).mock.calls[0][2];
    expect(signal.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '取消解析' }));
    expect(signal.aborted).toBe(true);
    await act(async () => parsing.resolve([parsedTask()]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(c.createTask).not.toHaveBeenCalled();
    expect(c.onSuccess).not.toHaveBeenCalled();
  });

  it('rejects invalid times before any task is saved and keeps errors editable', async () => {
    const c = dependencies();
    vi.mocked(parseImportTasks).mockResolvedValueOnce([
      parsedTask('任务一'),
      parsedTask('任务二'),
    ]);
    render(<SmartImportDialog {...c} />);
    await openReview();
    fireEvent.change(screen.getByLabelText('任务 2 结束时间'), {
      target: { value: '09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    expect(c.createTask).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('article', { name: '任务 2' })).getByRole('alert'),
    ).toHaveTextContent('结束时间需晚于有效的开始时间');
    expect(screen.getByLabelText('任务 2 结束时间')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('任务 2 开始时间'), {
      target: { value: '08:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(c.onSuccess).toHaveBeenCalledWith(2));
  });
});

describe('智能导入真实保存队列', () => {
  it('advances progress only after each actual save result and blocks dismissal during writes', async () => {
    const c = dependencies();
    const first = deferred<Task>();
    const second = deferred<Task>();
    vi.mocked(parseImportTasks).mockResolvedValueOnce([
      parsedTask('任务一'),
      parsedTask('任务二'),
    ]);
    c.createTask
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(<SmartImportDialog {...c} />);
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    expect(screen.getByText('正在导入 0/2 条')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '任务导入进度' })).toHaveAttribute(
      'value',
      '0',
    );
    expect(c.createTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(c.onClose).not.toHaveBeenCalled();
    await act(async () => first.resolve(c.createTask.mock.calls[0][0]));
    expect(screen.getByText('正在导入 1/2 条')).toBeInTheDocument();
    expect(c.createTask).toHaveBeenCalledTimes(2);
    expect(c.onSuccess).not.toHaveBeenCalled();
    await act(async () => second.resolve(c.createTask.mock.calls[1][0]));
    expect(c.onSuccess).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('reports partial results and retries only the failed identity and original snapshot', async () => {
    const c = dependencies();
    const failing = deferred<Task>();
    vi.mocked(parseImportTasks).mockResolvedValueOnce([
      parsedTask('成功任务'),
      parsedTask('失败任务'),
    ]);
    c.createTask
      .mockImplementationOnce(async (task) => task)
      .mockImplementationOnce(() => failing.promise);
    const view = render(<SmartImportDialog {...c} />);
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(c.createTask).toHaveBeenCalledTimes(2));
    const attempted = c.createTask.mock.calls[1][0];
    await act(async () => failing.reject(new Error('网络暂时不可用')));
    expect(screen.getByText(/已成功导入 1 条，失败 1 条/)).toBeInTheDocument();
    expect(c.onSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText('任务 2 名称')).toBeDisabled();
    expect(screen.getByLabelText('任务 1 名称')).toBeDisabled();
    view.rerender(<SmartImportDialog {...c} selectedDate="2026-12-01" />);
    fireEvent.click(screen.getByRole('button', { name: '重试失败任务' }));
    await waitFor(() => expect(c.onSuccess).toHaveBeenCalledExactlyOnceWith(2));
    expect(c.createTask).toHaveBeenCalledTimes(3);
    expect(c.createTask.mock.calls[2][0]).toBe(attempted);
    expect(c.createTask.mock.calls.map(([task]) => task.title)).toEqual([
      '成功任务',
      '失败任务',
      '失败任务',
    ]);
    expect(attempted.date).toBe(c.selectedDate);
    expect(attempted.completed).toBe(false);
  });

  it('synchronously rejects duplicate confirmation even before React commits a disabled button', async () => {
    const c = dependencies();
    const saving = deferred<Task>();
    vi.mocked(parseImportTasks).mockResolvedValueOnce([parsedTask()]);
    c.createTask.mockImplementationOnce(() => saving.promise);
    const { result } = renderHook(() => useSmartImport(c));
    act(() => result.current.setText('完成作业'));
    await act(async () => result.current.parse());
    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = result.current.confirm();
      duplicate = result.current.confirm();
    });
    expect(c.createTask).toHaveBeenCalledTimes(1);
    await act(async () => {
      saving.resolve(c.createTask.mock.calls[0][0]);
      await Promise.all([first, duplicate]);
    });
    expect(c.onSuccess).toHaveBeenCalledExactlyOnceWith(1);
  });
});
