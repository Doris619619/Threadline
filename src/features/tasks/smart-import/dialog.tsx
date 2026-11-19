/** @fileoverview 在同一弹窗内切换解析与紧凑五列表格确认，保留真实进度、全选和安全重试。 */

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { Button } from '@/components/ui/button';
import type { Project, Task } from '@/types/domain';
import { IMPORT_TEXT_LIMIT } from './client';
import { ImportTaskRow } from './task-row';
import { useSmartImport } from './use-smart-import';

/** 用图标标题和单行说明呈现精简输入界面；仅确认后写入，部分失败保留安全重试所需草稿。 */
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
  const selectable = state.rows.filter((row) => !row.saved).length;
  const attempted = state.rows.some((row) => row.task);
  /** 用原生半选状态表达只选了部分待导入行，不将已成功行计入全选。 */
  const syncSelection = (element: HTMLInputElement | null) => {
    if (element) element.indeterminate = selected > 0 && selected < selectable;
  };
  return (
    <ManagementDialog
      title={state.review ? '确认导入任务' : '智能导入任务'}
      headerIcon={<Sparkles size={26} aria-hidden="true" />}
      description={
        state.review
          ? undefined
          : '粘贴 Markdown、纯文本或自然语言内容，AI 将自动解析并生成任务。'
      }
      className={`smart-import-dialog ${state.review ? 'is-review' : 'is-input'}`}
      onClose={onClose}
      busy={state.importing}
    >
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
            placeholder="粘贴或输入任务内容…"
            onChange={(event) => state.setText(event.target.value)}
          />
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
            识别到 {state.rows.length} 条任务，可修改后导入
          </p>
          <div
            className="import-table-scroll"
            role="region"
            aria-label="待导入任务表格"
            tabIndex={0}
          >
            <div className="import-table">
              <div className="import-table-heading">
                <label className="import-task-selection">
                  <input
                    ref={syncSelection}
                    type="checkbox"
                    aria-label="全选待导入任务"
                    checked={selectable > 0 && selected === selectable}
                    disabled={state.importing || !selectable}
                    onChange={(event) => state.selectAll(event.target.checked)}
                  />
                </label>
                <div className="import-column-labels" aria-hidden="true">
                  <span>项目</span>
                  <span>任务</span>
                  <span>
                    预计时长 <small>分钟</small>
                  </span>
                  <span>开始时间</span>
                  <span>结束时间</span>
                </div>
                <span className="import-field-label">操作</span>
              </div>
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
            </div>
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
