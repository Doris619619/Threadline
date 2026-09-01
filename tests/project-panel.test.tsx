/** @fileoverview 验证项目/Daily 管理页不泄露执行态或项目绑定，并把低频操作放在菜单中。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectPanel } from '@/features/projects/project-panel';
import type { Daily } from '@/features/daily/types';
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

/** 渲染完整管理页并提供无副作用的云端命令替身。 */
function renderPanel() {
  const props = {
    items: projects,
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
  render(<ProjectPanel {...props} />);
  return props;
}

describe('ProjectPanel manager', () => {
  it('shows only project management facts and protects fallback operations', () => {
    renderPanel();
    expect(screen.getByText('科研')).toBeVisible();
    expect(screen.getByText('默认项目')).toBeVisible();
    expect(screen.queryByText(/累计/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Daily 历史/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('其他操作')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('科研操作'));
    expect(screen.getAllByText('归档')).toHaveLength(2);
    expect(screen.getAllByText('删除')).toHaveLength(2);
  });

  it('renders Daily as a planned-time disclosure without a project selector or execution state', () => {
    renderPanel();
    expect(screen.getAllByText('2 项 · 90 分钟')).toHaveLength(1);
    expect(screen.queryByText('实际')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/所属项目/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /英语学习/ }));
    expect(screen.getByText('词汇背诵')).toBeVisible();
    expect(screen.getByText('30 分钟')).toBeVisible();
  });
});

afterEach(cleanup);
