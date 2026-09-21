/** @fileoverview 自启动 UI 读取系统确认状态，刷新失败可重试且旧读取不会覆盖新操作。 */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import { unsupportedAutoStart, type AutoStartState } from '@/lib/desktop-auto-start';

/** Web/旧 bridge 降级为不支持；只有用户动作调用系统写入。 */
export function useAutoStart() {
  const [state, setState] = useState<AutoStartState | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const alive = useRef(false);
  const writing = useRef(false);
  /** 读取系统状态，返回焦点时也刷新；写入期间不发竞争读取。 */
  const reload = useCallback(async () => {
    if (writing.current) return;
    const request = ++generation.current;
    try {
      const bridge = getMainDesktopBridge();
      const next = bridge?.getAutoStartState
        ? await bridge.getAutoStartState()
        : await Promise.resolve(unsupportedAutoStart);
      if (alive.current && request === generation.current) {
        setState(next);
        setError(undefined);
      }
    } catch (cause) {
      if (alive.current && request === generation.current)
        setError(
          cause instanceof Error ? cause.message : '自启动状态读取失败，请重试。',
        );
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void Promise.resolve().then(reload);
    const refresh = () => {
      void reload();
    };
    window.addEventListener('focus', refresh);
    return () => {
      alive.current = false;
      window.removeEventListener('focus', refresh);
    };
  }, [reload]);
  /** undefined 表示以后再选；失败继续抛给引导，防止误记为完成。 */
  const save = async (enabled?: boolean) => {
    const bridge = getMainDesktopBridge();
    if (!bridge || writing.current) throw new Error('自启动设置尚未就绪。');
    writing.current = true;
    generation.current++;
    setBusy(true);
    setError(undefined);
    try {
      const next =
        enabled === undefined
          ? await bridge.deferAutoStart()
          : await bridge.setAutoStartEnabled(enabled);
      if (alive.current) setState(next);
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : '自启动设置失败，请重试。');
      throw cause;
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { state, error, busy, reload, save };
}
