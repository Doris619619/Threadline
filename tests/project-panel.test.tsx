/** @fileoverview 验证项目管理的指针入口归焦、独立 Daily 模板交互和数据边界。 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Daily } from '@/features/daily/types';
import { ProjectManagementPage } from '@/features/projects/project-management-page';
import { ProjectPanel } from '@/features/projects/project-panel';
import type { Project } from '@/types/domain';

const projects: Project[] = [
  {
    id: 'other',
    name: '其他',
    color: '#8793a7',
    status: 'active',
    isFallback: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'research',
    name: '科研',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-09-01',
  },
];
const daily: Daily[] = [
  {
    id: 'daily-1',
    title: '英语学习',
    actual: 0,
    result: '',
    completed: false,
    active: true,
    children: [
      {
        templateItemId: 'item-1',
        title: '词汇背诵',
        plannedDurationMinutes: 30,
        completed: false,
        actual: 0,
      },
      {
        templateItemId: 'item-2',
        title: '听力练习',
        plannedDurationMinutes: 60,
        completed: false,
        actual: 0,
      },
    ],
  },
];

/** 渲染完整项目管理页并提供可覆盖项目或 Daily fixture 的云端命令替身。 */
function renderPanel({
  projectItems = projects,
  dailyTemplates = daily,
}: {
  projectItems?: Project[];
  dailyTemplates?: Daily[];
} = {}) {
  const props = {
    projects: projectItems,
    dailyTemplates,
    onCreateProject: vi.fn(async () => undefined),
    onUpdateProject: vi.fn(async () => undefined),
    onSetProjectArchived: vi.fn(async () => undefined),
    onDeleteProject: vi.fn(async () => undefined),
    onCreateDaily: vi.fn(async () => undefined),
    onSaveDaily: vi.fn(async () => undefined),
    onSetDailyStatus: vi.fn(async () => undefined),
    onSetDailyItemStatus: vi.fn(async () => undefined),
  };
  const renderResult = render(<ProjectManagementPage {...props} />);
  return { ...props, ...renderResult };
}

/** 通过各区域创建入口打开 Dialog，保持测试与实际用户路径一致。 */
function openCreateMenu(target: '新建项目' | '新建 Daily') {
  fireEvent.click(screen.getByRole('button', { name: '+ ' + target, exact: true }));
}

describe('ProjectManagementPage', () => {
  it('keeps fallback project editable but protected without a noisy status label and Daily free of project state', () => {
    renderPanel();
    expect(screen.getByText('科研')).toBeVisible();
    expect(screen.queryByText('默认项目')).not.toBeInTheDocument();
    expect(screen.queryByText('活跃')).not.toBeInTheDocument();
    const fallbackRow = screen.getByRole('button', { name: '管理项目 其他' });
    const standardRow = screen.getByRole('button', { name: '管理项目 科研' });
    fireEvent.click(fallbackRow);
    const fallbackDialog = screen.getByRole('menu', { name: '其他项目操作' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(fallbackDialog).getByRole('menuitem', { name: '修改项目…' }),
    ).toBeVisible();
    expect(
      within(fallbackDialog).queryByRole('menuitem', { name: '归档项目' }),
    ).not.toBeInTheDocument();
    expect(
      within(fallbackDialog).queryByRole('menuitem', { name: '删除项目…' }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(fallbackDialog, { key: 'Escape' });
    fireEvent.click(standardRow);
    const standardDialog = screen.getByRole('menu', { name: '科研项目操作' });
    expect(
      within(standardDialog).getByRole('menuitem', { name: '修改项目…' }),
    ).toBeVisible();
    expect(
      within(standardDialog).getByRole('menuitem', { name: '归档项目' }),
    ).toBeVisible();
    expect(
      within(standardDialog).getByRole('menuitem', { name: '删除项目…' }),
    ).toBeVisible();
    expect(screen.getByText('2 项 · 90 分钟')).toBeVisible();
    expect(screen.queryByText(/Daily 历史/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/所属项目/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('清单 · 2 项'));
    expect(screen.getByText('词汇背诵')).toBeVisible();
    expect(screen.getByText('30 分钟')).toBeVisible();
    expect(screen.getByRole('button', { name: '管理清单项 词汇背诵' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /展开.*英语学习/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps an empty Daily checklist free of an inset while retaining its add-item action', () => {
    const { container } = renderPanel({
      dailyTemplates: [{ ...daily[0], children: [] }],
    });

    expect(container.querySelector('.daily-manager-inset')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('清单 · 0 项'));
    expect(screen.getByRole('button', { name: '添加清单项' })).toBeVisible();
  });

  it('keeps the Daily 0 label without rendering an empty grouped card', () => {
    const { container } = renderPanel({ dailyTemplates: [] });

    expect(screen.getByRole('heading', { name: 'Daily 0' })).toBeVisible();
    expect(container.querySelector('.manager-card--daily')).not.toBeInTheDocument();
  });

  it('opens project creation in the shared named Dialog instead of a persistent form', () => {
    renderPanel();
    expect(screen.queryByLabelText('新项目名称')).not.toBeInTheDocument();
    openCreateMenu('新建项目');
    expect(screen.getByRole('dialog', { name: '新建项目' })).toBeVisible();
    expect(screen.getByLabelText('项目名称')).toBeVisible();
    expect(screen.getByLabelText('项目颜色')).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('项目名称'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '新建项目' })).not.toBeInTheDocument();
  });

  it('opens the action menu from a pointer click and restores its real trigger after editing', () => {
    renderPanel();
    const row = screen.getByRole('button', { name: '管理项目 科研' });
    screen.getByRole('button', { name: '+ 新建项目' }).focus();
    fireEvent.click(row);
    const management = screen.getByRole('menu', { name: '科研项目操作' });
    expect(
      within(management).getByRole('menuitem', { name: '修改项目…' }),
    ).toHaveFocus();
    fireEvent.click(within(management).getByRole('menuitem', { name: '修改项目…' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '修改项目' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('项目名称'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(row);
  });

  it.each([
    ['管理项目 科研', 'menu', '科研项目操作'],
    ['+ 新建项目', 'dialog', '新建项目'],
    ['查看项目 科研', 'menu', '科研项目操作'],
  ])(
    'returns focus to the pointer opener %s even when another control was focused',
    (label, role, title) => {
      render(
        <>
          <button type="button">先前焦点</button>
          <ProjectPanel
            items={projects}
            onCreateProject={vi.fn(async () => undefined)}
            onUpdateProject={vi.fn(async () => undefined)}
            onSetProjectArchived={vi.fn(async () => undefined)}
            onDeleteProject={vi.fn(async () => undefined)}
          />
        </>,
      );
      screen.getByRole('button', { name: '先前焦点' }).focus();
      const opener = screen.getByRole('button', { name: label, exact: true });
      // fireEvent 不会代替指针触发器聚焦，覆盖 Safari 点击按钮仍保留旧 activeElement 的路径。
      fireEvent.click(opener);
      const surface = screen.getByRole(role, { name: title, exact: true });
      expect(surface).toBeVisible();
      fireEvent.keyDown(role === 'menu' ? surface : document, { key: 'Escape' });
      expect(screen.queryByRole(role)).toBeNull();
      expect(opener).toHaveFocus();
    },
  );

  it('locks archive commands once and keeps a failed request available for retry', async () => {
    const props = renderPanel();
    let reject!: (reason: Error) => void;
    const request = new Promise<undefined>((_resolve, no) => {
      reject = no;
    });
    props.onSetProjectArchived.mockReturnValueOnce(request);
    const trigger = screen.getByRole('button', { name: '管理项目 科研' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: '科研项目操作' });
    const archive = within(menu).getByRole('menuitem', { name: '归档项目' });
    act(() => {
      archive.click();
      archive.click();
    });
    expect(props.onSetProjectArchived).toHaveBeenCalledExactlyOnceWith(
      'research',
      true,
    );
    for (const command of within(menu).getAllByRole('menuitem'))
      expect(command).toBeDisabled();
    expect(trigger).toBeDisabled();
    await act(async () => reject(new Error('归档失败，请重试')));
    expect(within(menu).getByRole('alert')).toHaveTextContent('归档失败，请重试');
    expect(archive).toBeEnabled();
    fireEvent.click(archive);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(props.onSetProjectArchived).toHaveBeenNthCalledWith(2, 'research', true);
    expect(trigger).toHaveFocus();
  });

  it('restores an archived project through the original command', async () => {
    const props = renderPanel({
      projectItems: [projects[0], { ...projects[1], status: 'archived' }],
    });
    fireEvent.click(screen.getByRole('button', { name: '管理项目 科研' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '恢复项目' }));
    await waitFor(() =>
      expect(props.onSetProjectArchived).toHaveBeenCalledExactlyOnceWith(
        'research',
        false,
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires a separate delete confirmation and preserves failure, locking and pointer focus return', async () => {
    const props = renderPanel();
    const trigger = screen.getByRole('button', { name: '管理项目 科研' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: '科研项目操作' });
    const command = within(menu).getByRole('menuitem', { name: '删除项目…' });
    expect(command.previousElementSibling).toHaveRole('separator');
    fireEvent.click(command);
    let dialog = screen.getByRole('dialog', { name: '删除项目', exact: true });
    expect(
      within(dialog).getByRole('button', { name: '取消', exact: true }),
    ).toHaveFocus();
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '删除项目…' }));
    dialog = screen.getByRole('dialog', { name: '删除项目', exact: true });
    const submit = within(dialog).getByRole('button', {
      name: '删除项目',
      exact: true,
    });
    let reject!: (reason: Error) => void;
    props.onDeleteProject.mockReturnValueOnce(
      new Promise<undefined>((_resolve, no) => {
        reject = no;
      }),
    );
    act(() => {
      submit.click();
      submit.click();
    });
    expect(props.onDeleteProject).toHaveBeenCalledExactlyOnceWith('research');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(submit).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => reject(new Error('删除失败，请重试')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('删除失败，请重试');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.onDeleteProject).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveFocus();
  });

  it('focuses the requested Daily business field for append, template edit, and item edit dialogs', () => {
    renderPanel();
    const dailyRow = screen.getByRole('button', { name: '管理 Daily 英语学习' });
    fireEvent.click(dailyRow);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '英语学习' })).getByRole('button', {
        name: '修改 Daily',
      }),
    );
    expect(screen.getByRole('dialog', { name: '修改 Daily' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('Daily 名称'));
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByText('清单 · 2 项'));
    fireEvent.click(screen.getByRole('button', { name: '添加清单项' }));
    expect(screen.getByRole('dialog', { name: '添加到已有 Daily' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('选择已有 Daily'));
    fireEvent.keyDown(document, { key: 'Escape' });

    const itemRow = screen.getByRole('button', { name: '管理清单项 词汇背诵' });
    fireEvent.click(itemRow);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '词汇背诵' })).getByRole('button', {
        name: '修改清单项',
      }),
    );
    expect(screen.getByRole('dialog', { name: '修改清单项' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('清单项名称'));
  });

  it('creates a Daily atomically with zero to many planned checklist items', async () => {
    const props = renderPanel();
    openCreateMenu('新建 Daily');
    fireEvent.change(screen.getByLabelText('Daily 名称'), {
      target: { value: '晨间复盘' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ 添加清单项' }));
    fireEvent.change(screen.getByLabelText('清单项名称 1'), {
      target: { value: '记录要点' },
    });
    fireEvent.change(screen.getByLabelText('预计时间 1'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('创建'));
    await waitFor(() => expect(props.onCreateDaily).toHaveBeenCalledTimes(1));
    expect(props.onCreateDaily).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '晨间复盘',
        children: [
          expect.objectContaining({ title: '记录要点', plannedDurationMinutes: 15 }),
        ],
      }),
    );
  });

  it('uses the explicit append mode to add one planned item to an existing Daily', async () => {
    const props = renderPanel();
    openCreateMenu('新建 Daily');
    fireEvent.click(screen.getByRole('tab', { name: '添加到已有 Daily' }));
    fireEvent.change(screen.getByLabelText('清单项名称'), {
      target: { value: '精听' },
    });
    fireEvent.change(screen.getByLabelText('预计时间'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(1));
    expect(props.onSaveDaily).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'daily-1',
        children: expect.arrayContaining([
          expect.objectContaining({ title: '精听', plannedDurationMinutes: 25 }),
        ]),
      }),
    );
  });

  it('keeps archived children but excludes deleted children from every template-management save payload', async () => {
    const deletedChild = {
      templateItemId: 'item-deleted',
      title: '已删除清单',
      plannedDurationMinutes: 10,
      deletedAt: '2026-09-02T00:00:00.000Z',
      completed: false,
      actual: 0,
    };
    const archivedChild = {
      templateItemId: 'item-archived',
      title: '已归档清单',
      plannedDurationMinutes: 20,
      active: false,
      completed: false,
      actual: 0,
    };
    const props = renderPanel({
      dailyTemplates: [
        { ...daily[0], children: [daily[0].children[0], archivedChild, deletedChild] },
      ],
    });

    openCreateMenu('新建 Daily');
    fireEvent.click(screen.getByRole('tab', { name: '添加到已有 Daily' }));
    fireEvent.change(screen.getByLabelText('清单项名称'), {
      target: { value: '追加清单' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(1));
    expect(props.onSaveDaily.mock.calls[0]?.[0].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateItemId: 'item-1' }),
        expect.objectContaining({ templateItemId: 'item-archived' }),
        expect.objectContaining({ title: '追加清单' }),
      ]),
    );
    expect(props.onSaveDaily.mock.calls[0]?.[0].children).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateItemId: 'item-deleted' }),
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: '管理 Daily 英语学习' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '英语学习' })).getByRole('button', {
        name: '修改 Daily',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(2));
    expect(props.onSaveDaily.mock.calls[1]?.[0].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateItemId: 'item-1' }),
        expect.objectContaining({ templateItemId: 'item-archived' }),
      ]),
    );
    expect(props.onSaveDaily.mock.calls[1]?.[0].children).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateItemId: 'item-deleted' }),
      ]),
    );

    fireEvent.click(screen.getByText('清单 · 2 项'));
    fireEvent.click(screen.getByRole('button', { name: '管理清单项 词汇背诵' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '词汇背诵' })).getByRole('button', {
        name: '修改清单项',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(3));
    expect(props.onSaveDaily.mock.calls[2]?.[0].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateItemId: 'item-1' }),
        expect.objectContaining({ templateItemId: 'item-archived' }),
      ]),
    );
    expect(props.onSaveDaily.mock.calls[2]?.[0].children).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateItemId: 'item-deleted' }),
      ]),
    );
  });

  it('defaults append mode to an active Daily instead of an archived visible template', () => {
    renderPanel({
      dailyTemplates: [
        { ...daily[0], id: 'archived-daily', title: '已归档 Daily', active: false },
        { ...daily[0], id: 'active-daily', title: '可编辑 Daily' },
      ],
    });
    openCreateMenu('新建 Daily');
    fireEvent.click(screen.getByRole('tab', { name: '添加到已有 Daily' }));
    expect(screen.getByLabelText('选择已有 Daily')).toHaveValue('active-daily');
    expect(
      screen.queryByRole('option', { name: '已归档 Daily' }),
    ).not.toBeInTheDocument();
  });

  it('disables append mode when every Daily is archived', () => {
    renderPanel({ dailyTemplates: [{ ...daily[0], active: false }] });
    openCreateMenu('新建 Daily');
    expect(screen.getByRole('tab', { name: '添加到已有 Daily' })).toBeDisabled();
    expect(screen.queryByLabelText('选择已有 Daily')).not.toBeInTheDocument();
  });

  it('allows archived Daily and its existing item to save edits while keeping append unavailable', async () => {
    const archivedDaily = { ...daily[0], active: false };
    const props = renderPanel({ dailyTemplates: [archivedDaily] });

    fireEvent.click(screen.getByRole('button', { name: '管理 Daily 英语学习' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '英语学习' })).getByRole('button', {
        name: '修改 Daily',
      }),
    );
    expect(
      screen.queryByRole('button', { name: '添加清单项' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Daily 名称'), {
      target: { value: '归档后仍可改名' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(1));
    expect(props.onSaveDaily).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'daily-1', title: '归档后仍可改名' }),
    );

    fireEvent.click(screen.getByText('清单 · 2 项'));
    fireEvent.click(screen.getByRole('button', { name: '管理清单项 词汇背诵' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '词汇背诵' })).getByRole('button', {
        name: '修改清单项',
      }),
    );
    fireEvent.change(screen.getByLabelText('清单项名称'), {
      target: { value: '归档后仍可改清单' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(2));
    expect(props.onSaveDaily).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'daily-1',
        children: expect.arrayContaining([
          expect.objectContaining({ title: '归档后仍可改清单' }),
        ]),
      }),
    );

    openCreateMenu('新建 Daily');
    expect(screen.getByRole('tab', { name: '添加到已有 Daily' })).toBeDisabled();
  });
});

afterEach(cleanup);
