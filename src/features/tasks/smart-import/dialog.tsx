/** @fileoverview 在同一可访问弹窗内切换文本解析与六字段确认，展示不确定解析进度和真实保存进度。 */

import { useEffect, useRef } from 'react';
import { Info, Sparkles } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { Button } from '@/components/ui/button';
import type { Project, Task } from '@/types/domain';
import { IMPORT_TEXT_LIMIT } from './client';
import { ImportTaskRow } from './task-row';
import { useSmartImport } from './use-smart-import';

/** 仅用户确认后写入；返回修改保留原文，部分失败保留成功项和失败项原内容。 */
export function SmartImportDialog({
  client,
  projects,
  selectedDate,
  createTask,
  onClose,
  onSuccess,
}: {
  client?: SupabaseClient;
  projects: Project[];
  selectedDate: string;
  createTask: (task: Task) => Promise<Task>;
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const state = useSmartImport({
    client,
    projects,
    selectedDate,
    createTask,
    onSuccess,
  });
  const reviewHeading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.review) reviewHeading.current?.focus();
  }, [state.review]);
  const activeProjects = projects.filter(
    (project) => project.status === 'active' && !project.deletedAt,
  );
  const selected = state.rows.filter((row) => row.selected && !row.saved).length;
  const attempted = state.rows.some((row) => row.task);
  return (
    <ManagementDialog
      title={state.review ? '确认导入任务' : '智能导入任务'}
      className="smart-import-dialog"
      onClose={onClose}
      busy={state.importing}
    >
      <div className="import-intro">
        <span className="import-symbol">
          <Sparkles size={23} aria-hidden="true" />
        </span>
        <p>
          {state.review
            ? '检查任务后导入，未勾选的任务不会保存。'
            : '粘贴 Markdown、纯文本或自然语言，AI 将提炼需要执行的任务。'}
        </p>
      </div>
      {!state.review ? (
        <>
          <label className="import-source-label" htmlFor="smart-import-source">
            待解析内容
          </label>
          <textarea
            id="smart-import-source"
            className="import-source"
            data-management-initial-focus
            value={state.text}
            disabled={state.parsing}
            maxLength={IMPORT_TEXT_LIMIT}
            placeholder={
              '把想做的事粘贴在这里…\n\n比如：我明天要把 ECE4016 作业交了，还得看完 Lecture 6。对了，作业大概需要 90 分钟。'
            }
            onChange={(event) => state.setText(event.target.value)}
          />
          <p className="import-privacy">
            内容将发送至 DeepSeek 解析，确认导入前不会保存任务。
          </p>
          {state.parsing && (
            <div className="import-progress" role="status">
              <span>正在理解内容并提取任务…</span>
              <progress aria-label="正在解析任务" />
            </div>
          )}
        </>
      ) : (
        <>
          <p className="import-notice" ref={reviewHeading} tabIndex={-1}>
            <Info size={17} aria-hidden="true" />
            识别到 {state.rows.length} 条任务，可修改后导入
          </p>
          <div className="import-task-list">
            {state.rows.map((row, index) => (
              <ImportTaskRow
                key={row.id}
                row={row}
                index={index}
                projects={activeProjects}
                disabled={state.importing}
                onEdit={state.edit}
                onSelect={state.select}
              />
            ))}
            {!state.rows.length && (
              <p className="import-privacy">没有待导入任务，可以返回修改内容。</p>
            )}
          </div>
          {state.importing && (
            <div className="import-progress" role="status" aria-live="polite">
              <span>
                正在导入 {state.progress.done}/{state.progress.total} 条
              </span>
              <progress
                aria-label="任务导入进度"
                value={state.progress.done}
                max={state.progress.total}
              />
            </div>
          )}
          {state.result && state.result.failed > 0 && (
            <p className="import-partial" role="status">
              已成功导入 {state.result.success} 条，失败 {state.result.failed}{' '}
              条。可重试失败任务，已导入的任务不会重复保存。
            </p>
          )}
          {attempted && !state.importing && (
            <p className="import-privacy">已提交的内容已锁定，重试会保留原内容。</p>
          )}
        </>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <footer>
        <Button
          type="button"
          disabled={state.importing}
          onClick={state.review && !attempted ? state.back : onClose}
        >
          {state.review && !attempted
            ? '返回修改'
            : state.parsing
              ? '取消解析'
              : '取消'}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={
            state.parsing ||
            state.importing ||
            (state.review ? !selected : !state.text.trim())
          }
          onClick={() => void (state.review ? state.confirm() : state.parse())}
        >
          {state.review
            ? state.result?.failed
              ? '重试失败任务'
              : '确认导入'
            : '开始解析'}
        </Button>
      </footer>
    </ManagementDialog>
  );
}
