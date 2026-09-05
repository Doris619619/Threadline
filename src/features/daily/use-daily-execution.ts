/** @fileoverview 管理单个 Daily 的输入草稿与串行提交，避免失焦、打卡和记录互相覆盖。 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { Daily } from '@/features/daily/types';

/** 分钟输入允许编辑时的空值，提交时只接受非负整数。 */
function minutes(value: string): number {
  if (!value.trim()) return 0;
  const number = Number(value);
  if (
    !/^\d+$/.test(value.trim()) ||
    !Number.isSafeInteger(number) ||
    number > 2147483647
  )
    throw new Error('实际耗时请填写有效的非负整数分钟。');
  return number;
}

/** 创建不依赖服务器逐字回显的字符串草稿，0 分钟初始显示空输入。 */
function createDraft(daily: Daily) {
  return {
    daily,
    actual: daily.actual ? String(daily.actual) : '',
    childrenActual: daily.children.map((child) =>
      child.actual ? String(child.actual) : '',
    ),
  };
}

/** 失焦、打卡和记录共用 flush；失败保留草稿，只在真实提交中显示保存状态。 */
export function useDailyExecution(
  daily: Daily,
  date: string,
  onSave: (daily: Daily, date: string) => Promise<void>,
) {
  const [draft, setDraft] = useState(() => createDraft(daily));
  const [source, setSource] = useState(daily);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const current = useRef(draft);
  const saved = useRef(JSON.stringify(daily));
  const pending = useRef<Promise<void> | null>(null);

  // 只接纳干净实例的云端刷新，不覆盖尚未提交或失败的输入。
  if (source !== daily) {
    setSource(daily);
    if (!dirty && !saving) {
      const fresh = createDraft(daily);
      setDraft(fresh);
    }
  }

  /** 布局提交后同步云端新草稿，避免在 React render 中修改 ref。 */
  useLayoutEffect(() => {
    current.current = draft;
  }, [draft]);

  /** 同步更新 ref 和 React 草稿，让同一事件周期的失焦/点击读取最新输入。 */
  const edit = (change: (value: typeof draft) => typeof draft) => {
    const next = change(current.current);
    current.current = next;
    setDraft(next);
    setDirty(true);
    setError(undefined);
  };

  /** 将有效输入组成父子原子快照，不写入 NaN、小数或负分钟。 */
  const snapshot = (): Daily => {
    const value = current.current;
    return {
      ...value.daily,
      actual: minutes(value.actual),
      children: value.daily.children.map((child, index) => ({
        ...child,
        actual: minutes(value.childrenActual[index]),
      })),
    };
  };

  /** 同一实例每次只提交一个快照；最新草稿在前一次完成后继续保存。 */
  const flush = async (): Promise<Daily> => {
    try {
      while (pending.current) await pending.current;
      const next = snapshot();
      const serialized = JSON.stringify(next);
      if (serialized !== saved.current) {
        setSaving(true);
        const operation = onSave(next, date);
        pending.current = operation;
        try {
          await operation;
          saved.current = serialized;
        } finally {
          if (pending.current === operation) pending.current = null;
          setSaving(false);
        }
        if (JSON.stringify(snapshot()) !== serialized) return flush();
      }
      setDirty(false);
      setError(undefined);
      return next;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败，请重试。');
      throw failure;
    }
  };

  /** 事件入口的失败已由本行展示，不产生未处理 Promise。 */
  const save = () => {
    void flush().catch(() => undefined);
  };
  return { draft, edit, flush, save, saving, error, setError };
}
