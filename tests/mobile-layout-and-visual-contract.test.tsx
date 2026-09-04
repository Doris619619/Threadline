/**
 * @fileoverview 验证移动端与桌面端任务行 DOM 契约、操作收敛、触控热区、各平台图标资源契约与登录页防裁切规范。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent, cleanup } from '@testing-library/react';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { threadlineMetadata } from '@/app/root-document';
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
  importance: 'normal',
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
  importance: 'normal',
  priority: 0,
  order: 0,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

describe('mobile layout and visual regression contracts', () => {
  afterEach(() => {
    cleanup();
  });
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

  /** 验证移动端操作收敛：不再提供工作站相关操作，仅保留编辑、移期、待安排、放弃和删除。 */
  it('converges task actions into more-options menu without workstation items', () => {
    const { getByLabelText, getByText, queryByText } = render(
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
      />,
    );

    const moreButton = getByLabelText('测试任务更多操作');
    expect(moreButton).toBeVisible();

    fireEvent.click(moreButton);
    expect(queryByText('加入工作站')).toBeNull();
    expect(queryByText('从工作站移除')).toBeNull();
    expect(getByText('详细编辑')).toBeVisible();
    expect(getByText('移期')).toBeVisible();
    expect(getByText('待安排')).toBeVisible();
    expect(getByText('放弃')).toBeVisible();
    expect(getByText('删除')).toBeVisible();
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

  /** 验证移动端 CSS 契约：Checkbox 与更多操作拥有独立 44x44 触控区且工作站/拖拽柄在移动端彻底隐藏。 */
  it('enforces 44x44 touch hit areas and hidden workstation/drag actions on mobile task rows', () => {
    const dashboardCss = readFileSync(projectFile('src/features/tasks/task-dashboard.css'), 'utf8');
    
    // Checkbox 触控包装容器在移动端占用 44x44 布局独立槽位，杜绝侵占标题
    expect(dashboardCss).toMatch(
      /\.timeline-row \.task-check-wrap,\s*\.quick-task-row \.task-check-wrap\s*\{[^}]*flex:\s*0 0 44px/s,
    );
    expect(dashboardCss).toMatch(
      /\.timeline-row \.task-check-wrap,\s*\.quick-task-row \.task-check-wrap\s*\{[^}]*width:\s*44px/s,
    );

    // 更多操作按钮在移动端满足 44x44 触控热区
    expect(dashboardCss).toMatch(
      /\.task-actions > button:not\(\.task-workstation-action\)\s*\{[^}]*width:\s*44px/s,
    );
    expect(dashboardCss).toMatch(
      /\.task-actions > button:not\(\.task-workstation-action\)\s*\{[^}]*height:\s*44px/s,
    );

    // 移动端工作站与拖拽手柄彻底隐藏
    expect(dashboardCss).toMatch(
      /\.task-actions > \.task-workstation-action,\s*\.task-actions-cell \.task-workstation-action,\s*\.task-actions-cell \.task-drag-handle\s*\{[^}]*display:\s*none !important/s,
    );
  });

  /** 验证普通网页图标（PNG/SVG）保留视觉透明圆角，四角完全透明。 */
  it('validates brand icon assets have true alpha transparency for standard web display', async () => {
    const iconPngBuffer = readFileSync(projectFile('public/icon.png'));
    const desktopIconPngBuffer = readFileSync(projectFile('public/desktop/threadline-app-icon.png'));

    const meta = await sharp(iconPngBuffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);

    const { data, info } = await sharp(iconPngBuffer).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);

    const getAlpha = (x: number, y: number) => {
      const idx = (y * info.width + x) * 4;
      return data[idx + 3];
    };

    // 验证四角完全透明（Alpha = 0）
    expect(getAlpha(0, 0)).toBe(0);
    expect(getAlpha(info.width - 1, 0)).toBe(0);
    expect(getAlpha(0, info.height - 1)).toBe(0);
    expect(getAlpha(info.width - 1, info.height - 1)).toBe(0);

    // 验证中心图标主体是不透明的
    expect(getAlpha(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBe(255);

    // 验证桌面图标具有相同的透明度属性
    const desktopMeta = await sharp(desktopIconPngBuffer).metadata();
    expect(desktopMeta.format).toBe('png');
    expect(desktopMeta.hasAlpha).toBe(true);

    // 验证 SVG 嵌入的是带透明通道的 PNG
    const svgContent = readFileSync(projectFile('public/icon.svg'), 'utf8');
    expect(svgContent).toContain('data:image/png;base64,');
  });

  /** 验证 Apple Touch Icon 和 PWA Maskable Icon 专供全画布不透明正方形，四角 alpha=255。 */
  it('validates apple-touch-icon and icon-maskable have full-bleed opaque backgrounds without transparent corners', async () => {
    const appleIconBuffer = readFileSync(projectFile('public/apple-touch-icon.png'));
    const maskableIconBuffer = readFileSync(projectFile('public/icon-maskable.png'));

    for (const [name, buffer] of [
      ['apple-touch-icon.png', appleIconBuffer],
      ['icon-maskable.png', maskableIconBuffer],
    ] as const) {
      const meta = await sharp(buffer).metadata();
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);

      const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
      const getPixel = (x: number, y: number) => {
        const idx = (y * info.width + x) * 4;
        return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
      };

      // 验证四角与各处均为完全不透明 (Alpha = 255)
      expect(getPixel(0, 0)[3], `${name} top-left alpha`).toBe(255);
      expect(getPixel(info.width - 1, 0)[3], `${name} top-right alpha`).toBe(255);
      expect(getPixel(0, info.height - 1)[3], `${name} bottom-left alpha`).toBe(255);
      expect(getPixel(info.width - 1, info.height - 1)[3], `${name} bottom-right alpha`).toBe(255);

      // 验证中心 Threadline 标志正常
      expect(getPixel(Math.floor(info.width / 2), Math.floor(info.height / 2))[3]).toBe(255);
    }
  });

  /** 验证 Root Metadata 与 Manifest 分别引用符合平台规范的专用资源。 */
  it('validates root document metadata and webmanifest reference the dedicated platform assets', () => {
    // 验证 Metadata 分离引用
    expect(threadlineMetadata.icons).toEqual({
      icon: '/icon.png',
      apple: '/apple-touch-icon.png',
    });

    // 验证 Web Manifest
    const manifest = JSON.parse(readFileSync(projectFile('public/manifest.webmanifest'), 'utf8'));
    const iconAny = manifest.icons.find((i: { purpose?: string; src: string }) => i.src === '/icon.png');
    const iconMaskable = manifest.icons.find((i: { purpose?: string; src: string }) => i.src === '/icon-maskable.png');

    expect(iconAny).toBeDefined();
    expect(iconAny.purpose).toBe('any');
    expect(iconMaskable).toBeDefined();
    expect(iconMaskable.purpose).toBe('maskable');

    // 验证 Service Worker 预缓存列表覆盖所有专用图标
    const swContent = readFileSync(projectFile('public/sw.js'), 'utf8');
    expect(swContent).toContain("'/apple-touch-icon.png'");
    expect(swContent).toContain("'/icon-maskable.png'");
    expect(swContent).toContain("'/icon.png'");
    expect(swContent).toContain("'/icon.svg'");
  });
});
