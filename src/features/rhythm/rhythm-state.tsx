/** @fileoverview 节律领域的独立本地状态与动作；它不依赖 workspace analytics，也不向其暴露标记数据。 */

'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';

type RhythmState = { marks: Record<string, boolean> };
type RhythmActions = { toggleMark: (date: string) => void };
const RhythmStateContext = createContext<RhythmState | null>(null);
const RhythmActionsContext = createContext<RhythmActions | null>(null);

/** 提供只在本设备存储的节律标记，不与任务、Daily 或报告数据合并。 */
export function RhythmStateProvider({ children }: { children: ReactNode }) {
  const [marks, updateMarks] = usePersistentState<Record<string, boolean>>(
    'threadline.rhythm.v1',
    {},
  );
  const state = useMemo(() => ({ marks }), [marks]);
  const actions = useMemo(
    () => ({
      toggleMark: (date: string) =>
        updateMarks((current) => ({ ...current, [date]: !current[date] })),
    }),
    [updateMarks],
  );
  return (
    <RhythmActionsContext.Provider value={actions}>
      <RhythmStateContext.Provider value={state}>
        {children}
      </RhythmStateContext.Provider>
    </RhythmActionsContext.Provider>
  );
}

/** 读取节律领域状态与唯一的日期标记动作。 */
export function useRhythmState() {
  const state = useContext(RhythmStateContext);
  const actions = useContext(RhythmActionsContext);
  if (!state || !actions)
    throw new Error('useRhythmState must be used inside RhythmStateProvider.');
  return { ...state, ...actions };
}
