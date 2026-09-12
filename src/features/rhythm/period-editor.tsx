/** @fileoverview 生理期短表单：补录、结束和修改共用可访问对话框，失败时保留输入。 */
'use client';
import { useRef, useState } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import type { PeriodDraft } from './period-rules';

/** 保存等待真实持久化；删除必须再次确认，取消不会写入数据。 */
export function PeriodEditor({
  initial,
  title,
  today,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  initial: PeriodDraft;
  title: string;
  today: string;
  existing: boolean;
  onSave: (draft: PeriodDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [start, setStart] = useState(initial.startDate);
  const [end, setEnd] = useState(initial.endDate ?? '');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  /** 不关闭失败表单，以便网络恢复或更正日期后重试。 */
  const commit = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (deleting) await onDelete(initial.id);
      else
        await onSave({ id: initial.id, startDate: start, endDate: end || undefined });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <ManagementDialog
      busy={busy}
      title={deleting ? '删除这次记录？' : title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="period-form"
        onSubmit={(event) => {
          event.preventDefault();
          void commit();
        }}
      >
        {deleting ? (
          <p>这次记录将从月历与统计中移除。</p>
        ) : (
          <>
            <label>
              开始日期
              <input
                data-management-initial-focus
                aria-label="开始日期"
                type="date"
                required
                max={today}
                value={start}
                disabled={busy}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              结束日期（未结束可留空）
              <input
                aria-label="结束日期"
                type="date"
                min={start}
                max={today}
                value={end}
                disabled={busy}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="period-text-button"
              disabled={busy}
              onClick={() => setEnd('')}
            >
              清空结束日期，设为进行中
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="period-error">
            {error}
          </p>
        )}
        <footer>
          {existing && !deleting && (
            <button
              className="period-delete"
              type="button"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              删除记录
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => (deleting ? setDeleting(false) : onClose())}
          >
            取消
          </button>
          <button className="period-save" type="submit" disabled={busy}>
            {busy ? '保存中…' : deleting ? '确认删除' : '保存'}
          </button>
        </footer>
      </form>
    </ManagementDialog>
  );
}
