/** @fileoverview 覆盖统一启动页对认证、工作区数据与 Realtime 真实状态的可见映射。 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StartupProgressProvider,
  useOptionalStartupProgress,
  type StartupOperation,
} from '@/features/startup/startup-progress-context';
import { ThreadlineStartupScreen } from '@/features/startup/threadline-startup-screen';

/** 通过真实的状态桥接模拟 WorkspaceDataProvider 已报告的数据与订阅状态。 */
function StartupHarness({
  authentication,
  workspaceInitialization,
  workspaceData,
  realtime,
}: {
  authentication: StartupOperation;
  workspaceInitialization: StartupOperation;
  workspaceData?: StartupOperation;
  realtime?: StartupOperation;
}) {
  return (
    <StartupProgressProvider
      active
      authentication={authentication}
      workspaceInitialization={workspaceInitialization}
    >
      <StartupReporter workspaceData={workspaceData} realtime={realtime} />
      <p>工作台已挂载</p>
    </StartupProgressProvider>
  );
}

/** 将测试输入写入 Context，模拟数据层与 Realtime 回调而不伪造时间推进。 */
function StartupReporter({
  workspaceData,
  realtime,
}: {
  workspaceData?: StartupOperation;
  realtime?: StartupOperation;
}) {
  const progress = useOptionalStartupProgress();
  useEffect(() => {
    if (workspaceData) progress?.setWorkspaceDataStatus(workspaceData);
    if (realtime) progress?.setRealtimeStatus(realtime);
  }, [progress, realtime, workspaceData]);
  return null;
}

const completed: StartupOperation = { status: 'completed' };
const active: StartupOperation = { status: 'active' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Threadline startup progress', () => {
  /** 长等待只开放恢复入口，不伪造任何完成阶段。 */
  it('offers recovery after a real wait without advancing progress', async () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(
      <ThreadlineStartupScreen
        progress={{
          authentication: completed,
          workspaceInitialization: completed,
          workspaceData: active,
          realtime: active,
        }}
        onRetry={retry}
      />,
    );
    expect(screen.queryByRole('button', { name: '重新加载' })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByLabelText('已完成 2 个启动阶段')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  /** Session 尚未从 Supabase 恢复时，首个阶段是唯一进行中的阶段。 */
  it('shows session recovery as active before authentication resolves', () => {
    render(
      <StartupHarness
        authentication={active}
        workspaceInitialization={{ status: 'pending' }}
      />,
    );

    expect(screen.getByText('恢复登录状态')).toBeInTheDocument();
    expect(screen.getByLabelText('正在恢复登录状态…')).toBeInTheDocument();
  });

  /** 认证完成后，云工作区初始化接替为当前阶段。 */
  it('moves from completed authentication to active workspace initialization', () => {
    render(
      <StartupHarness authentication={completed} workspaceInitialization={active} />,
    );

    expect(screen.getByLabelText('已完成')).toBeInTheDocument();
    expect(screen.getByLabelText('正在初始化云工作区…')).toBeInTheDocument();
  });

  /** 初始化成功后，真实 query/local hydration 状态驱动第三阶段。 */
  it('keeps workspace data active until hydration reports completion', () => {
    render(
      <StartupHarness
        authentication={completed}
        workspaceInitialization={completed}
        workspaceData={active}
      />,
    );

    expect(screen.getByLabelText('正在同步项目、任务与 Daily…')).toBeInTheDocument();
    expect(screen.getByText('开启实时同步')).toBeInTheDocument();
    expect(screen.getByLabelText('等待中')).toBeInTheDocument();
  });

  /** 所有业务数据完成且 Realtime 已确认订阅时，第四阶段才显示为完成。 */
  it('marks realtime complete only after a subscribed state is reported', () => {
    render(
      <ThreadlineStartupScreen
        progress={{
          authentication: completed,
          workspaceInitialization: completed,
          workspaceData: completed,
          realtime: completed,
        }}
      />,
    );

    expect(screen.getAllByLabelText('已完成')).toHaveLength(4);
  });

  /** 初始化失败保留真实错误，业务 query 失败同样不能伪装为已完成。 */
  it('surfaces initialization and data errors without advancing the failed stage', () => {
    const { rerender } = render(
      <StartupHarness
        authentication={completed}
        workspaceInitialization={{
          status: 'failed',
          message: 'initialize_workspace: denied',
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('initialize_workspace: denied');

    rerender(
      <StartupHarness
        authentication={completed}
        workspaceInitialization={completed}
        workspaceData={{ status: 'failed', message: 'list tasks: network failed' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('list tasks: network failed');
  });

  /** 数据已可用时，Realtime 失败不再遮挡工作台，也不会显示为订阅成功。 */
  it('does not block the workspace when realtime fails after data hydration', () => {
    render(
      <StartupHarness
        authentication={completed}
        workspaceInitialization={completed}
        workspaceData={completed}
        realtime={{ status: 'failed', message: 'Realtime timed out' }}
      />,
    );

    expect(screen.getByText('工作台已挂载')).toBeInTheDocument();
    expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  });
});
