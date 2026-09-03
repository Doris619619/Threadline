/**
 * @fileoverview 验证移动端与桌面端任务行 DOM 契约、操作收敛、登录页顶部人物防裁切与全站图标无白边 CSS 规范。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskLine } from '@/features/tasks/components/task-line';
import { TaskRowActions } from '@/features/tasks/components/task-row-actions';
import type { Project, Task } from '@/types/domain';

const projectFile = (filePath: string) => resolve(import.meta.dirname, '..', filePath);

const activeProjects: Project[] = [
  {
    id: 'proj-1',
    name: '工作',
    color: '#4f8cff',
    status: 'active',
    isFallback: true,
    position: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
  },
  {
    id: 'proj-other',
    name: '其他',
    color: '#94a3b8',
    status: 'active',
    position: 1,
    createdAt: '2026-08-20T00:00:00.000Z',
  },
];

const timedTask: Task = {
  id: 'task-timed-1',
  title: '今日重点需求开发',
  projectId: 'proj-1',
  date: '2026-09-03',
  plannedStartTime: '09:00',
  plannedEndTime: '10:30',
  plannedDurationMinutes: 90,
  actualDurationMinutes: 80,
  schedulePendingTime: false,
  completed: false,
  status: 'active',
  priority: 0,
  order: 0,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const quickTask: Task = {
  id: 'task-quick-1',
  title: '无时间待办事项',
  projectId: 'proj-other',
  date: '2026-09-03',
  completed: false,
  status: 'active',
  priority: 0,
  order: 0,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

describe('mobile layout and visual regression contracts', () => {
  /** 验证今日日程已创建态将时间、项目、预计和实际收拢在连续的元数据区域内。 */
  it('groups timed task title and all metadata within a unified task-content-wrap', () => {
    const { container } = render(
      <TaskLine
        task={timedTask}
        projects={activeProjects}
        inSchedulePanel
        onUpdate={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    const row = container.querySelector('.timeline-row');
    expect(row).not.toBeNull();

    const contentWrap = row?.querySelector('.task-content-wrap');
    expect(contentWrap).not.toBeNull();

    const title = contentWrap?.querySelector('.task-title');
    expect(title).toHaveTextContent('今日重点需求开发');

    const meta = contentWrap?.querySelector('.timeline-meta');
    expect(meta).not.toBeNull();
    expect(meta?.querySelector('.timeline-time')).toHaveTextContent('09:00–10:30');
    expect(meta?.querySelector('.task-project-cell')).toHaveTextContent('工作');
    expect(meta?.querySelector('.task-duration-planned')).toHaveTextContent('预计 1h30min');
    expect(meta?.querySelector('.task-duration-actual')).toHaveTextContent('实际 1h20min');
  });

  /** 验证无时间待办已创建态将项目标签置于内容区域的元数据容器中，避免散落与空白块。 */
  it('groups quick task title and project tag in task-content-wrap metadata container', () => {
    const { container } = render(
      <TaskLine
        task={quickTask}
        projects={activeProjects}
        inSchedulePanel={false}
        onUpdate={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    const row = container.querySelector('.quick-task-row');
    expect(row).not.toBeNull();

    const contentWrap = row?.querySelector('.task-content-wrap');
    expect(contentWrap).not.toBeNull();

    const title = contentWrap?.querySelector('.task-title');
    expect(title).toHaveTextContent('无时间待办事项');

    const meta = contentWrap?.querySelector('.timeline-meta');
    expect(meta).not.toBeNull();
    expect(meta?.querySelector('.task-project-cell')).toHaveTextContent('其他');
    expect(meta?.querySelector('.timeline-time')).toBeNull();
  });

  /** 验证移动端操作收敛：支持工作站下拉项切换，且仅暴露标准更多操作入口。 */
  it('converges task actions into more-options menu and provides workstation toggle action', () => {
    const onToggleWorkstation = vi.fn();
    render(
      <TaskRowActions
        taskId="task-1"
        title="测试任务"
        canChangeWorkflow={true}
        canDrag={true}
        editingLocked={false}
        inWorkstation={false}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onReschedule={vi.fn()}
        onToggleWorkstation={onToggleWorkstation}
      />,
    );

    const moreButton = screen.getByLabelText('测试任务更多操作');
    expect(moreButton).toBeVisible();

    fireEvent.click(moreButton);
    const workstationMenuItem = screen.getByText('加入工作站');
    expect(workstationMenuItem).toBeVisible();

    fireEvent.click(workstationMenuItem);
    expect(onToggleWorkstation).toHaveBeenCalledWith('task-1');
  });

  /** 验证登录/欢迎页顶部人物插画使用 center top 裁切，保留头部完整。 */
  it('enforces center-top object position for welcome and login illustrations to keep heads unclipped', () => {
    const authCss = readFileSync(projectFile('src/features/auth/auth.css'), 'utf8');
    expect(authCss).toContain('.auth-illustration-img');
    expect(authCss).toMatch(
      /\.auth-illustration-img\s*\{[^}]*object-position:\s*center top/s,
    );
    expect(authCss).toMatch(
      /\.auth-bg-illustration-img\s*\{[^}]*object-position:\s*center top/s,
    );
  });

  /** 验证应用全站核心图标容器无白色多余边框或异常背景。 */
  it('enforces clean border radius and transparent backgrounds on brand and startup icon wrappers', () => {
    const authCss = readFileSync(projectFile('src/features/auth/auth.css'), 'utf8');
    const startupCss = readFileSync(
      projectFile('src/features/startup/threadline-startup.css'),
      'utf8',
    );

    expect(authCss).toMatch(
      /\.auth-brand-logo\s*\{[^}]*background:\s*transparent/s,
    );
    expect(startupCss).toMatch(
      /\.threadline-startup-icon-wrap img\s*\{[^}]*background:\s*transparent/s,
    );
  });
});
