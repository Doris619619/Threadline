/** @fileoverview 验证连续清单、逐项项目下拉、中文 Enter、手机步骤与失败重试的稳定草稿身份。 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StageEditor } from '@/features/stage-plans/editor';
import type { Project, StagePlan } from '@/types/domain';
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
it('keeps the opening version when realtime replaces the stage while its draft is open', async () => {
  const opening: StagePlan = {
    id: 'stage',
    name: '原阶段',
    startDate: '2026-10-01',
    endDate: '2026-10-08',
    homeVisible: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00.123456Z',
  };
  const remote = {
    ...opening,
    name: '另一台设备修改',
    updatedAt: '2026-10-01T00:00:00.123457Z',
  };
  commands.update.mockImplementation(async (baseline: StagePlan) => {
    if (baseline.updatedAt !== remote.updatedAt)
      throw new Error('阶段已在其他设备修改，草稿已保留。');
    return remote;
  });
  const close = vi.fn();
  const view = render(<StageEditor plan={opening} onClose={close} />);
  fireEvent.change(screen.getByLabelText('阶段名称'), {
    target: { value: '本机草稿' },
  });
  view.rerender(<StageEditor plan={remote} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  await screen.findByText('阶段已在其他设备修改，草稿已保留。');
  expect(commands.update.mock.calls[0][0]).toEqual(opening);
  expect(screen.getByLabelText('阶段名称')).toHaveValue('本机草稿');
  expect(close).not.toHaveBeenCalled();
});
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

it('changes projects per draft without changing the next task or stable IDs through retry', async () => {
  const projects: Project[] = [
    {
      id: 'other',
      name: '其他',
      color: '#888888',
      status: 'active',
      isFallback: true,
      createdAt: '2026-10-01',
    },
    {
      id: 'work',
      name: '工作',
      color: '#3979e8',
      status: 'active',
      createdAt: '2026-10-01',
    },
    {
      id: 'archived',
      name: '已归档项目',
      color: '#888888',
      status: 'archived',
      createdAt: '2026-10-01',
    },
  ];
  commands.create.mockRejectedValueOnce(new Error('网络失败'));
  render(<StageEditor onClose={vi.fn()} projects={projects} />);
  fillName();
  const input = screen.getByLabelText('阶段任务名称');
  expect(screen.getByRole('combobox', { name: '阶段任务项目' })).toHaveTextContent(
    '其他',
  );
  expect(screen.queryByRole('option', { name: '已归档项目' })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '默认项目' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  const firstId = screen
    .getByLabelText('任务草稿 1')
    .closest('[data-stage-draft-id]')
    ?.getAttribute('data-stage-draft-id');
  chooseProject('阶段任务项目', '工作');
  fireEvent.change(input, { target: { value: '工作任务' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: '移除这一项' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  chooseProject('任务草稿 1 项目', '工作');
  chooseProject('任务草稿 2 项目', '其他');
  expect(screen.getByRole('combobox', { name: '阶段任务项目' })).toHaveTextContent(
    '工作',
  );
  fireEvent.change(screen.getByLabelText('任务草稿 1'), {
    target: { value: '修改后属于工作项目' },
  });
  fireEvent.click(screen.getByRole('button', { name: '移除草稿 移除这一项' }));
  expect(input).toHaveFocus();
  expect(screen.getAllByRole('textbox', { name: /任务草稿/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));
  await screen.findByText('网络失败');
  fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));
  await waitFor(() => expect(commands.create).toHaveBeenCalledTimes(2));
  const draft = commands.create.mock.calls[0][0];
  expect(draft.tasks).toEqual([
    { id: firstId, title: '修改后属于工作项目', projectId: 'work' },
    { id: expect.any(String), title: '工作任务', projectId: 'other' },
  ]);
  expect(commands.create.mock.calls[1][0]).toEqual(draft);
});

it('keeps mobile steps short and preserves task IDs when returning to stage details', async () => {
  const width = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
  try {
    render(<StageEditor onClose={vi.fn()} />);
    fillName();
    expect(screen.queryByLabelText('阶段任务名称')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    const input = screen.getByLabelText('阶段任务名称');
    fireEvent.change(input, { target: { value: '手机任务' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const id = screen
      .getByLabelText('任务草稿 1')
      .closest('[data-stage-draft-id]')
      ?.getAttribute('data-stage-draft-id');
    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    expect(screen.getByLabelText('阶段名称')).not.toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByLabelText('任务草稿 1')).toHaveValue('手机任务');
    fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));
    await waitFor(() => expect(commands.create).toHaveBeenCalledOnce());
    expect(commands.create.mock.calls[0][0].tasks[0].id).toBe(id);
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  }
});

/** 操作真实菜单，断言业务选择；顶层定位由浏览器测试负责。 */
function chooseProject(label: string, name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(
    within(screen.getByRole('listbox', { name: label + '选项' })).getByRole('option', {
      name,
    }),
  );
}
