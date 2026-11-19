/** @fileoverview 管理解析草稿与逐条保存队列，按真实结果推进进度并只重试未确认任务。 */

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Task } from '@/types/domain';
import type { TimedTaskDraft } from '../task-drafts';
import { buildTimedTask } from '../task-create';
import { estimateFromTimeRange } from '../task-time';
import { parseImportTasks } from './client';

export type ImportRow = {
  id: string;
  draft: TimedTaskDraft;
  selected: boolean;
  saved?: boolean;
  error?: string;
  /** 首次发送后冻结内容，网络结果不明时重试同一任务，不覆写已提交数据。 */
  task?: Task;
};

/** 持有同一弹窗的两步草稿；所有持久化都发生在显式确认后。 */
export function useSmartImport({
  client,
  projects,
  selectedDate,
  createTask,
  onSuccess,
}: {
  client?: SupabaseClient;
  projects: Project[];
  selectedDate: string;
  createTask: (task: Task) => Promise<Task>;
  onSuccess: (count: number) => void;
}) {
  const [text, setText] = useState('');
  const [review, setReview] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ success: number; failed: number }>();
  const lock = useRef(false);
  const request = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  // 日期在弹窗打开时捕获，部分失败重试不随首页日期改变。
  const [importDate] = useState(selectedDate);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  /** 解析只生成可编辑草稿；不识别的项目落到真实的“其他”项目。 */
  const parse = async () => {
    if (lock.current) return;
    lock.current = true;
    setParsing(true);
    setError(undefined);
    const controller = new AbortController();
    request.current = controller;
    try {
      const parsed = await parseImportTasks(client, text, controller.signal);
      if (!mounted.current) return;
      const active = projects.filter(
        (project) => project.status === 'active' && !project.deletedAt,
      );
      const fallback = active.find((project) => project.isFallback);
      if (!fallback) throw new Error('“其他”项目不可用，请刷新工作区后重试。');
      if (!parsed.length)
        throw new Error('没有识别到需要执行的任务，请补充具体行动后再解析。');
      setRows(
        parsed.map((task) => ({
          id: crypto.randomUUID(),
          selected: true,
          draft: {
            title: task.title,
            projectId:
              active.find((project) => project.id === task.projectId)?.id ??
              fallback.id,
            startTime: task.startTime ?? '',
            endTime: task.endTime ?? '',
            planned:
              task.plannedMinutes === null
                ? estimateFromTimeRange(task.startTime ?? '', task.endTime ?? '', '')
                : String(task.plannedMinutes),
            actual: task.actualMinutes === null ? '' : String(task.actualMinutes),
            completed: false,
          },
        })),
      );
      setReview(true);
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : '解析失败，请重试。');
    } finally {
      lock.current = false;
      if (mounted.current) setParsing(false);
    }
  };

  /** 原位编辑六项参数；起止时间变动复用日程的自动估时规则，发送过的任务保留原快照。 */
  const edit = (id: string, patch: Partial<TimedTaskDraft>) => {
    if (lock.current) return;
    setResult(undefined);
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id || row.task) return row;
        const draft = { ...row.draft, ...patch };
        if ('startTime' in patch || 'endTime' in patch)
          draft.planned = estimateFromTimeRange(
            draft.startTime,
            draft.endTime,
            draft.planned,
          );
        return { ...row, draft, error: undefined };
      }),
    );
  };

  /** 仅改变是否导入或移除草稿，不修改已保存的任务。 */
  const select = (id: string, remove = false) => {
    if (lock.current) return;
    setRows((current) =>
      current.flatMap((row) => {
        if (row.id !== id || row.saved) return [row];
        return remove ? [] : [{ ...row, selected: !row.selected }];
      }),
    );
  };

  /** 先完整校验选中项，再顺序等待真实保存；失败继续处理余项，重试固定 UUID 与已发送内容。 */
  const confirm = async () => {
    if (lock.current) return;
    const pending = rows.filter((row) => row.selected && !row.saved);
    if (!pending.length) return;
    const queue: { row: ImportRow; task: Task }[] = [];
    const errors = new Map<string, string>();
    for (const row of pending) {
      try {
        queue.push({
          row,
          task: row.task ?? buildTimedTask(row.draft, projects, importDate, row.id),
        });
      } catch (cause) {
        errors.set(row.id, cause instanceof Error ? cause.message : '请检查任务参数。');
      }
    }
    if (errors.size) {
      setRows((current) =>
        current.map((row) => ({ ...row, error: errors.get(row.id) })),
      );
      setError('请修正标出的任务，再确认导入。');
      return;
    }
    lock.current = true;
    setImporting(true);
    setError(undefined);
    setResult(undefined);
    setProgress({ done: 0, total: queue.length });
    let success = rows.filter((row) => row.saved).length;
    let failed = 0;
    try {
      for (const [index, { row, task }] of queue.entries()) {
        if (!mounted.current) break;
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, task, error: undefined } : item,
          ),
        );
        try {
          await createTask(task);
          success++;
          if (mounted.current)
            setRows((current) =>
              current.map((item) =>
                item.id === row.id ? { ...item, saved: true } : item,
              ),
            );
        } catch (cause) {
          failed++;
          if (mounted.current)
            setRows((current) =>
              current.map((item) =>
                item.id === row.id
                  ? {
                      ...item,
                      error:
                        cause instanceof Error ? cause.message : '保存失败，请重试。',
                    }
                  : item,
              ),
            );
        }
        if (mounted.current) setProgress({ done: index + 1, total: queue.length });
      }
      if (!mounted.current) return;
      setResult({ success, failed });
      if (!failed) onSuccess(success);
    } finally {
      lock.current = false;
      if (mounted.current) setImporting(false);
    }
  };

  /** 仅在尚未发送任何任务时返回原文本，避免重新解析清掉安全重试所需的快照。 */
  const back = () => {
    if (!lock.current && !rows.some((row) => row.task)) {
      setReview(false);
      setError(undefined);
    }
  };
  return {
    text,
    setText,
    review,
    rows,
    parsing,
    importing,
    error,
    progress,
    result,
    parse,
    edit,
    select,
    confirm,
    back,
  };
}
