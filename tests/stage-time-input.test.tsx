/** @fileoverview 验证时间环的预览与选择语义分离、小扇区等价入口及经典项目的键盘操作入口。 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StageTimeChart } from '@/features/stage-plans/time-chart';
import type { Project, StagePlan, Task } from '@/types/domain';

afterEach(cleanup);

const projects: Project[] = [
  {
    id: 'p',
    name: '科研',
    color: '#2864c7',
    status: 'active',
    createdAt: '2026-11-19',
  },
];
const plan: StagePlan = {
  id: 's',
  name: '阶段',
  startDate: '2026-11-19',
  endDate: '2026-11-20',
  homeVisible: true,
  createdAt: '2026-11-19',
  updatedAt: '2026-11-19',
};
const tasks: Task[] = [60, 1, 0, undefined].map((minutes, index) => ({
  id: 't' + index,
  projectId: 'p',
  stagePlanId: 's',
  title: ['主要任务', '小扇区', '零预计', '未估时'][index],
  plannedDurationMinutes: minutes,
  status: 'waiting',
  completed: false,
  createdAt: '2026-11-19',
  updatedAt: '2026-11-19',
}));

/** 通过真实图表状态容器渲染选择，避免仅断言传入 props 的伪交互。 */
function renderChart(layout: 'new' | 'classic' = 'new') {
  return render(
    <StageTimeChart
      tasks={tasks}
      projects={projects}
      plan={plan}
      today="2026-11-19"
      layout={layout}
      onSaveEstimate={vi.fn()}
      onSaveActual={vi.fn()}
    />,
  );
}

describe('stage time input equivalence', () => {
  it('does not announce selection from hover or focus and toggles only on activation', () => {
    renderChart();
    const callout = screen.getByRole('button', { name: '查看 小扇区 1min' });
    fireEvent.mouseEnter(callout);
    expect(callout).toHaveAttribute('aria-pressed', 'false');
    fireEvent.focus(callout);
    expect(callout).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(callout);
    expect(callout).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(callout);
    expect(callout).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps every plotted sector accessible and zero/unknown tasks available in details', () => {
    const { container } = renderChart();
    const ids = [...container.querySelectorAll('[data-stage-slice]')].map((slice) =>
      slice.getAttribute('data-stage-slice'),
    );
    const labels = [...container.querySelectorAll('[data-stage-label]')].map((label) =>
      label.getAttribute('data-stage-label'),
    );
    expect(ids).toHaveLength(2);
    expect(labels.sort()).toEqual(ids.sort());
    expect(screen.getByRole('button', { name: '零预计 0min' })).toBeVisible();
    expect(screen.getByRole('button', { name: '未估时 未估时' })).toBeVisible();
  });

  it('provides a distinct project selection button without collapsing its task disclosure', () => {
    const { container } = renderChart('classic');
    const project = screen.getByRole('button', { name: '查看 科研 项目时间' });
    const disclosure = project
      .closest('.stage-time-classic-group')!
      .querySelector('details')!;
    expect(disclosure).toHaveAttribute('open');
    fireEvent.click(project);
    expect(project).toHaveAttribute('aria-pressed', 'true');
    expect(disclosure).toHaveAttribute('open');
    expect(container.querySelector('.stage-time-center-title')).toHaveTextContent(
      '科研',
    );
  });
});
