/**
 * @fileoverview 汇总认证、云工作区、数据 hydration 与 Realtime 的真实启动状态，供启动 UI 只读消费。
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThreadlineStartupScreen } from '@/features/startup/threadline-startup-screen';

export type StartupOperationStatus = 'pending' | 'active' | 'completed' | 'failed';

export type StartupOperation = {
  status: StartupOperationStatus;
  message?: string;
  retry?: () => void;
};

export type StartupProgressSnapshot = {
  authentication: StartupOperation;
  workspaceInitialization: StartupOperation;
  accountTimezone: StartupOperation;
  workspaceData: StartupOperation;
  realtime: StartupOperation;
};

type StartupProgressContextValue = StartupProgressSnapshot & {
  setAccountTimezoneStatus: (operation: StartupOperation) => void;
  setWorkspaceDataStatus: (operation: StartupOperation) => void;
  setRealtimeStatus: (operation: StartupOperation) => void;
  setPersonalizationActive: (active: boolean) => void;
};

const StartupProgressContext = createContext<StartupProgressContextValue | null>(null);

const pendingOperation: StartupOperation = { status: 'pending' };

/** 比较状态快照，避免 Query 或 Realtime 的重复回调制造无意义重渲染。 */
function sameOperation(left: StartupOperation, right: StartupOperation): boolean {
  return (
    left.status === right.status &&
    left.message === right.message &&
    left.retry === right.retry
  );
}

/** 允许数据层在非云端测试适配器中不挂载启动状态桥接。 */
export function useOptionalStartupProgress(): StartupProgressContextValue | null {
  return useContext(StartupProgressContext);
}

/**
 * 将认证运行时的前两阶段与工作区数据层后两阶段聚合，并在数据可用后撤去阻塞启动层。
 * Realtime 不会决定工作台是否可用；它的失败状态保留在 Context 供非阻塞提示消费。
 */
export function StartupProgressProvider({
  authentication,
  workspaceInitialization,
  active,
  children,
  onRetry,
}: {
  authentication: StartupOperation;
  workspaceInitialization: StartupOperation;
  active: boolean;
  children: ReactNode;
  onRetry?: () => void;
}) {
  const [workspaceDataState, setWorkspaceDataState] =
    useState<StartupOperation>(pendingOperation);
  const [accountTimezone, setAccountTimezoneState] =
    useState<StartupOperation>(pendingOperation);
  const [realtime, setRealtimeState] = useState<StartupOperation>(pendingOperation);
  const [personalizationActive, setPersonalizationActive] = useState(false);

  /** 接收 WorkspaceDataProvider 的真实 query 与本机 hydration 结果。 */
  const setWorkspaceDataStatus = useCallback((operation: StartupOperation) => {
    setWorkspaceDataState((current) =>
      sameOperation(current, operation) ? current : operation,
    );
  }, []);

  /** 时区失败由最外层启动界面展示并重试，不把按钮隐藏在遮罩下。 */
  const setAccountTimezoneStatus = useCallback((operation: StartupOperation) => {
    setAccountTimezoneState((current) =>
      sameOperation(current, operation) ? current : operation,
    );
  }, []);

  /** 接收 Supabase channel 的订阅结果，绝不把失败映射成已完成。 */
  const setRealtimeStatus = useCallback((operation: StartupOperation) => {
    setRealtimeState((current) =>
      sameOperation(current, operation) ? current : operation,
    );
  }, []);

  const workspaceData = useMemo<StartupOperation>(
    () =>
      workspaceInitialization.status === 'completed' &&
      workspaceDataState.status === 'pending'
        ? { status: 'active' }
        : workspaceDataState,
    [workspaceDataState, workspaceInitialization.status],
  );
  const shouldShowStartup =
    active &&
    !personalizationActive &&
    (authentication.status !== 'completed' ||
      workspaceInitialization.status !== 'completed' ||
      accountTimezone.status !== 'completed' ||
      workspaceData.status !== 'completed');
  const value = useMemo<StartupProgressContextValue>(
    () => ({
      accountTimezone,
      setAccountTimezoneStatus,
      authentication,
      workspaceInitialization,
      workspaceData,
      realtime,
      setWorkspaceDataStatus,
      setRealtimeStatus,
      setPersonalizationActive,
    }),
    [
      accountTimezone,
      setAccountTimezoneStatus,
      authentication,
      realtime,
      setRealtimeStatus,
      setWorkspaceDataStatus,
      workspaceData,
      workspaceInitialization,
    ],
  );

  return (
    <StartupProgressContext.Provider value={value}>
      {children}
      {shouldShowStartup && (
        <ThreadlineStartupScreen progress={value} onRetry={onRetry} />
      )}
    </StartupProgressContext.Provider>
  );
}
