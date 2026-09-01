/** @fileoverview 验证项目管理与独立 Daily 模板管理的关键交互和数据边界。 */

import {
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
  render(<ProjectManagementPage {...props} />);
  return props;
}

describe('ProjectManagementPage', () => {
  it('keeps fallback project editable but protected without a noisy status label and Daily free of project state', () => {
    renderPanel();
    expect(screen.getByText('科研')).toBeVisible();
    expect(screen.queryByText('默认项目')).not.toBeInTheDocument();
    expect(screen.queryByText('活跃')).not.toBeInTheDocument();
    const fallbackMenu = screen.getByLabelText('其他操作').closest('details');
    const standardMenu = screen.getByLabelText('科研操作').closest('details');
    expect(fallbackMenu).not.toBeNull();
    expect(standardMenu).not.toBeNull();
    fireEvent.click(screen.getByLabelText('其他操作'));
    expect(
      within(fallbackMenu as HTMLElement).getByRole('button', { name: '修改' }),
    ).toBeVisible();
    expect(
      within(fallbackMenu as HTMLElement).queryByRole('button', { name: '归档' }),
    ).not.toBeInTheDocument();
    expect(
      within(fallbackMenu as HTMLElement).queryByRole('button', { name: '删除' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('科研操作'));
    expect(
      within(standardMenu as HTMLElement).getByRole('button', { name: '修改' }),
    ).toBeVisible();
    expect(
      within(standardMenu as HTMLElement).getByRole('button', { name: '归档' }),
    ).toBeVisible();
    expect(
      within(standardMenu as HTMLElement).getByRole('button', { name: '删除' }),
    ).toBeVisible();
    expect(screen.getByText('2 项 · 90 分钟')).toBeVisible();
    expect(screen.queryByText(/Daily 历史/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/所属项目/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /英语学习/ }));
    expect(screen.getByText('词汇背诵')).toBeVisible();
    expect(screen.getByText('30 分钟')).toBeVisible();
  });

  it('opens project creation in the shared named Dialog instead of a persistent form', () => {
    renderPanel();
    expect(screen.queryByLabelText('新项目名称')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    expect(screen.getByRole('dialog', { name: '新建项目' })).toBeVisible();
    expect(screen.getByLabelText('项目名称')).toBeVisible();
    expect(screen.getByLabelText('项目颜色')).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('项目名称'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '新建项目' })).not.toBeInTheDocument();
  });

  it('closes the project details menu before editing and restores focus to its trigger', () => {
    renderPanel();
    const menu = screen.getByLabelText('科研操作');
    menu.focus();
    fireEvent.click(menu);
    const details = menu.closest('details');
    expect(details).toHaveAttribute('open');
    fireEvent.click(
      within(details as HTMLElement).getByRole('button', { name: '修改' }),
    );
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByRole('dialog', { name: '修改项目' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('项目名称'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(menu);
  });

  it('focuses the requested Daily business field for append, template edit, and item edit dialogs', () => {
    renderPanel();
    const dailyMenu = screen.getByLabelText('英语学习操作');
    fireEvent.click(dailyMenu);
    fireEvent.click(
      within(dailyMenu.closest('details') as HTMLElement).getByRole('button', {
        name: '修改',
      }),
    );
    expect(screen.getByRole('dialog', { name: '修改 Daily' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('Daily 名称'));
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /英语学习/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ 添加清单项' }));
    expect(screen.getByRole('dialog', { name: '添加到已有 Daily' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('选择已有 Daily'));
    fireEvent.keyDown(document, { key: 'Escape' });

    const itemMenu = screen.getByLabelText('词汇背诵操作');
    fireEvent.click(itemMenu);
    fireEvent.click(
      within(itemMenu.closest('details') as HTMLElement).getByRole('button', {
        name: '修改',
      }),
    );
    expect(screen.getByRole('dialog', { name: '修改清单项' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('清单项名称'));
  });

  it('creates a Daily atomically with zero to many planned checklist items', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /新建 Daily/ }));
    fireEvent.change(screen.getByLabelText('Daily 名称'), {
      target: { value: '晨间复盘' },
    });
    fireEvent.click(screen.getByText('+ 添加清单项'));
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
    fireEvent.click(screen.getByRole('button', { name: /新建 Daily/ }));
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

    fireEvent.click(screen.getByRole('button', { name: /新建 Daily/ }));
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
      expect.arrayContaining([expect.objectContaining({ templateItemId: 'item-deleted' })]),
    );

    fireEvent.click(screen.getByLabelText('英语学习操作'));
    fireEvent.click(
      within(
        screen.getByLabelText('英语学习操作').closest('details') as HTMLElement,
      ).getByRole('button', { name: '修改' }),
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
      expect.arrayContaining([expect.objectContaining({ templateItemId: 'item-deleted' })]),
    );

    fireEvent.click(screen.getByRole('button', { name: /英语学习/ }));
    fireEvent.click(screen.getByLabelText('词汇背诵操作'));
    fireEvent.click(
      within(
        screen.getByLabelText('词汇背诵操作').closest('details') as HTMLElement,
      ).getByRole('button', { name: '修改' }),
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
      expect.arrayContaining([expect.objectContaining({ templateItemId: 'item-deleted' })]),
    );
  });

  it('defaults append mode to an active Daily instead of an archived visible template', () => {
    renderPanel({
      dailyTemplates: [
        { ...daily[0], id: 'archived-daily', title: '已归档 Daily', active: false },
        { ...daily[0], id: 'active-daily', title: '可编辑 Daily' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /新建 Daily/ }));
    fireEvent.click(screen.getByRole('tab', { name: '添加到已有 Daily' }));
    expect(screen.getByLabelText('选择已有 Daily')).toHaveValue('active-daily');
    expect(
      screen.queryByRole('option', { name: '已归档 Daily' }),
    ).not.toBeInTheDocument();
  });

  it('disables append mode when every Daily is archived', () => {
    renderPanel({ dailyTemplates: [{ ...daily[0], active: false }] });
    fireEvent.click(screen.getByRole('button', { name: /新建 Daily/ }));
    expect(screen.getByRole('tab', { name: '添加到已有 Daily' })).toBeDisabled();
    expect(screen.queryByLabelText('选择已有 Daily')).not.toBeInTheDocument();
  });

  it('allows archived Daily and its existing item to save edits while keeping append unavailable', async () => {
    const archivedDaily = { ...daily[0], active: false };
    const props = renderPanel({ dailyTemplates: [archivedDaily] });

    fireEvent.click(screen.getByLabelText('英语学习操作'));
    fireEvent.click(
      within(
        screen.getByLabelText('英语学习操作').closest('details') as HTMLElement,
      ).getByRole('button', { name: '修改' }),
    );
    expect(
      screen.queryByRole('button', { name: '+ 添加清单项' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Daily 名称'), {
      target: { value: '归档后仍可改名' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(props.onSaveDaily).toHaveBeenCalledTimes(1));
    expect(props.onSaveDaily).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'daily-1', title: '归档后仍可改名' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /英语学习/ }));
    fireEvent.click(screen.getByLabelText('词汇背诵操作'));
    fireEvent.click(
      within(
        screen.getByLabelText('词汇背诵操作').closest('details') as HTMLElement,
      ).getByRole('button', { name: '修改' }),
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

    fireEvent.click(screen.getByRole('button', { name: /新建 Daily/ }));
    expect(screen.getByRole('tab', { name: '添加到已有 Daily' })).toBeDisabled();
  });
});

afterEach(cleanup);
