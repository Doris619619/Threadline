/** @fileoverview Preview 生理期的可恢复持久化，读取和写入失败均向界面报告。 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPersistentStateRepository } from '@/lib/repository';
import { getLocalDateKey } from '@/lib/local-date';
import { validatePeriod, type PeriodDraft, type PeriodRecord } from './period-rules';

const periodsKey = 'threadline.test.periods.v1';

/** 保留旧标记键；写入确认后才更新可见状态，不把存储失败当成成功。 */
export function useLocalPeriodState() {
  const repository = useMemo(() => createPersistentStateRepository(), []);
  const [data, setData] = useState<{
    marks: Record<string, boolean>;
    periods: PeriodRecord[];
  }>({ marks: {}, periods: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      repository.read<Record<string, boolean>>('threadline.test.rhythm.v1'),
      repository.read<PeriodRecord[]>(periodsKey),
    ])
      .then(([marks, periods]) => {
        if (active) {
          setData({ marks: marks ?? {}, periods: periods ?? [] });
          setError(undefined);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('读取生理期记录失败，请重试');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [repository, attempt]);

  /** 先读最新持久状态再校验，保留其他标签页已经完成的更改。 */
  const persist = async (action: { draft: PeriodDraft } | { id: string }) => {
    if (!navigator.onLine) throw new Error('当前离线，输入已保留，请联网后重试');
    const records = (await repository.read<PeriodRecord[]>(periodsKey)) ?? [];
    const id = 'draft' in action ? action.draft.id : action.id;
    const existing = records.find((record) => record.id === id);
    if (existing?.deletedAt || (!('draft' in action) && !existing))
      throw new Error('记录已被删除，请关闭表单后重试');
    const now = new Date().toISOString();
    let next: PeriodRecord[];
    if ('draft' in action) {
      validatePeriod(action.draft, records, getLocalDateKey());
      next = [
        { ...action.draft, createdAt: existing?.createdAt ?? now, updatedAt: now },
        ...records.filter((record) => record.id !== id),
      ];
    } else {
      next = records.map((record) =>
        record.id === id ? { ...record, deletedAt: now, updatedAt: now } : record,
      );
    }
    try {
      await repository.write(periodsKey, next);
    } catch {
      throw new Error('保存生理期记录失败，输入已保留，请检查本地存储后重试');
    }
    setData((current) => ({ ...current, periods: next }));
  };
  return {
    marks: data.marks,
    periods: data.periods.filter((period) => !period.deletedAt),
    loading,
    error,
    save: (draft: PeriodDraft) => persist({ draft }),
    remove: (id: string) => persist({ id }),
    retry: () => {
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}
