/** @fileoverview 展示可直接编辑的六项导入参数，长任务名随内容增高且不隐藏可选字段。 */

import { useLayoutEffect, useRef } from 'react';
import { Check, Trash2 } from 'lucide-react';
import type { Project } from '@/types/domain';
import type { TimedTaskDraft } from '../task-drafts';
import type { ImportRow } from './use-smart-import';

/** 每条草稿只有六项业务字段；勾选与删除只控制本次导入，已发送内容锁定以支持安全重试。 */
export function ImportTaskRow({
  row,
  index,
  projects,
  disabled,
  onEdit,
  onSelect,
}: {
  row: ImportRow;
  index: number;
  projects: Project[];
  disabled: boolean;
  onEdit: (id: string, patch: Partial<TimedTaskDraft>) => void;
  onSelect: (id: string, remove?: boolean) => void;
}) {
  const title = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = title.current;
    if (!element) return;
    /** 标题输入或容器宽度改变时展开所有行；观察宽度防止自身高度更新触发循环。 */
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight + 2}px`;
    };
    resize();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [row.draft.title]);
  const locked = disabled || Boolean(row.task);
  const errorId = `import-error-${row.id}`;
  return (
    <article
      className={`import-task${!row.selected ? 'is-excluded' : ''}`}
      aria-label={`任务 ${index + 1}`}
    >
      <label className="import-task-selection">
        <input
          type="checkbox"
          aria-label={`导入任务 ${index + 1}`}
          checked={row.selected}
          disabled={disabled || row.saved}
          onChange={() => onSelect(row.id)}
        />
      </label>
      <fieldset
        className="import-task-fields"
        disabled={locked}
        aria-describedby={row.error ? errorId : undefined}
      >
        <label className="import-task-title">
          任务名称 <span aria-hidden="true">*</span>
          <textarea
            ref={title}
            rows={1}
            required
            value={row.draft.title}
            aria-label={`任务 ${index + 1} 名称`}
            aria-invalid={Boolean(row.error)}
            onChange={(event) => onEdit(row.id, { title: event.target.value })}
          />
        </label>
        <label className="import-task-project">
          项目 <span aria-hidden="true">*</span>
          <select
            required
            value={row.draft.projectId}
            aria-label={`任务 ${index + 1} 项目`}
            onChange={(event) => onEdit(row.id, { projectId: event.target.value })}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          开始时间
          <input
            value={row.draft.startTime}
            placeholder="--:--"
            inputMode="decimal"
            aria-label={`任务 ${index + 1} 开始时间`}
            onChange={(event) => onEdit(row.id, { startTime: event.target.value })}
          />
        </label>
        <label>
          结束时间
          <input
            value={row.draft.endTime}
            placeholder="--:--"
            inputMode="decimal"
            aria-label={`任务 ${index + 1} 结束时间`}
            onChange={(event) => onEdit(row.id, { endTime: event.target.value })}
          />
        </label>
        <label>
          预计时长 <span className="import-field-unit">分钟</span>
          <input
            value={row.draft.planned}
            placeholder="留空"
            inputMode="numeric"
            aria-label={`任务 ${index + 1} 预计时长`}
            onChange={(event) => onEdit(row.id, { planned: event.target.value })}
          />
        </label>
        <label>
          实际耗时 <span className="import-field-unit">分钟</span>
          <input
            value={row.draft.actual}
            placeholder="留空"
            inputMode="numeric"
            aria-label={`任务 ${index + 1} 实际耗时`}
            onChange={(event) => onEdit(row.id, { actual: event.target.value })}
          />
        </label>
      </fieldset>
      <div className="import-task-action">
        {row.saved ? (
          <Check size={18} aria-label="已导入" />
        ) : (
          <button
            type="button"
            aria-label={`删除任务 ${index + 1}`}
            disabled={disabled}
            onClick={() => onSelect(row.id, true)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {row.error && (
        <p className="import-task-error" id={errorId} role="alert">
          {row.error}
        </p>
      )}
    </article>
  );
}
