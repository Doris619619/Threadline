/** @fileoverview 阶段创建中的轻量清单编辑器；行内修改、连续输入及长草稿滚动均不写入数据库。 */
'use client';

import { useEffect, useId, useLayoutEffect, useRef, type RefObject } from 'react';
import { CornerDownLeft, Plus, X } from 'lucide-react';
import type { StageTaskDraft } from './rules';
import type { Project } from '@/types/domain';

type StageDraftListProps = {
  items: StageTaskDraft[];
  pending: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onPendingChange: (title: string) => void;
  onChange: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  projects: Project[];
  projectId?: string;
  onProjectChange: (id: string) => void;
};

/** 单项草稿随文字自动增高，长标题完整换行；Enter 返回连续输入，中文选词不跳走。 */
function DraftTaskRow({
  item,
  index,
  inputRef,
  onChange,
  onRemove,
  projectName,
}: Pick<StageDraftListProps, 'inputRef' | 'onChange' | 'onRemove'> & {
  item: StageTaskDraft;
  index: number;
  projectName?: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const control = textarea.current;
    if (!control) return;
    /** 文本或排版宽度改变时重新量高，避免旋转手机后长草稿被截断。 */
    const fit = () => {
      control.style.height = '0px';
      control.style.height = control.scrollHeight + 'px';
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    let width = control.clientWidth;
    const observer = new ResizeObserver(() => {
      if (control.clientWidth === width) return;
      width = control.clientWidth;
      fit();
    });
    observer.observe(control);
    return () => observer.disconnect();
  }, [item.title]);
  return (
    <li className="stage-draft-item" data-stage-draft-id={item.id}>
      <span className="stage-draft-bullet" aria-hidden="true" />
      <textarea
        ref={textarea}
        rows={1}
        required
        maxLength={200}
        aria-label={'任务草稿 ' + (index + 1)}
        value={item.title}
        onChange={(event) => onChange(item.id, event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      />
      <span className="stage-draft-project-name">{projectName}</span>
      <button
        type="button"
        aria-label={'移除草稿 ' + item.title}
        onClick={() => onRemove(item.id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/** 一份连续清单共用底部输入；新增后滚动到最新项，编辑或删除不改变当前阅读位置。 */
export function StageDraftList({
  items,
  pending,
  inputRef,
  onPendingChange,
  onChange,
  onRemove,
  onAdd,
  projects,
  projectId,
  onProjectChange,
}: StageDraftListProps) {
  const titleId = useId();
  const hintId = useId();
  const list = useRef<HTMLUListElement>(null);
  const previousCount = useRef(items.length);
  useEffect(() => {
    if (items.length > previousCount.current && list.current)
      list.current.scrollTop = list.current.scrollHeight;
    previousCount.current = items.length;
  }, [items.length]);
  return (
    <section className="stage-draft-list" aria-labelledby={titleId}>
      <div className="stage-draft-heading">
        <h3 id={titleId}>
          任务清单 <span>{items.length}</span>
        </h3>
      </div>
      <div className="stage-draft-sheet">
        {items.length > 0 && (
          <ul ref={list} aria-label="阶段任务草稿">
            {items.map((item, index) => (
              <DraftTaskRow
                key={item.id}
                item={item}
                index={index}
                inputRef={inputRef}
                onChange={onChange}
                onRemove={onRemove}
                projectName={
                  projects.find((project) => project.id === item.projectId)?.name
                }
              />
            ))}
          </ul>
        )}
        <div className="stage-draft-composer">
          <Plus size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="阶段任务名称"
            aria-describedby={hintId}
            maxLength={200}
            placeholder="添加任务…"
            value={pending}
            onChange={(event) => onPendingChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (!event.nativeEvent.isComposing && event.keyCode !== 229) onAdd();
            }}
          />
          <button type="button" onClick={onAdd} disabled={!pending.trim()}>
            添加 <CornerDownLeft size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="stage-draft-settings">
        <p id={hintId}>Enter 连续添加</p>
        {projects.length > 0 && (
          <label className="stage-draft-project">
            <span>归属项目</span>
            <select
              aria-label="阶段任务项目"
              value={projectId ?? ''}
              onChange={(event) => onProjectChange(event.target.value)}
            >
              {projects
                .filter((project) => project.status === 'active')
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
