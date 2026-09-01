/** @fileoverview 验证项目管理与独立 Daily 模板管理的关键交互和数据边界。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** 渲染完整项目管理页并提供可断言的云端命令替身。 */
function renderPanel() {
  const props = {
    projects,
    dailyTemplates: daily,
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
  it('keeps fallback project protected and Daily free of project or execution state', () => {
    renderPanel();
    expect(screen.getByText('科研')).toBeVisible();
    expect(screen.getByText('默认项目')).toBeVisible();
    expect(screen.queryByLabelText('其他操作')).not.toBeInTheDocument();
    expect(screen.getByText('2 项 · 90 分钟')).toBeVisible();
    expect(screen.queryByText(/Daily 历史/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/所属项目/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /英语学习/ }));
    expect(screen.getByText('词汇背诵')).toBeVisible();
    expect(screen.getByText('30 分钟')).toBeVisible();
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
});

afterEach(cleanup);
