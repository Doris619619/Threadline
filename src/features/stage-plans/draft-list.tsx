/** @fileoverview 阶段连续清单编辑器；随所选名称伸缩的原生项目下拉与行内修改只更新草稿。 */
'use client';

import { useEffect, useId, useLayoutEffect, useRef, type RefObject } from 'react';
import { ChevronDown, CornerDownLeft, Plus, X } from 'lucide-react';
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
  onItemProjectChange: (itemId: string, projectId: string) => void;
};

/** 当前名称决定可见宽度，原生 select 覆盖完整点击区；键盘与手机仍使用系统选择器。 */
function DraftProjectPicker({
  projects,
  projectId,
  label,
  onChange,
}: {
  projects: Project[];
  projectId?: string;
  label: string;
  onChange: (projectId: string) => void;
}) {
  if (!projects.length) return null;
  const selectedName = projects.find((project) => project.id === projectId)?.name;
  return (
    <span className="stage-draft-project-picker">
      <span className="stage-draft-project-value" aria-hidden="true">
        {selectedName ?? '选择项目'}
      </span>
      <ChevronDown size={14} aria-hidden="true" />
      <select
        aria-label={label}
        title={selectedName}
        value={projectId ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {projects
          .filter((project) => project.status === 'active')
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </select>
    </span>
  );
}

/** 单项草稿随文字自动增高，长标题完整换行；Enter 返回连续输入，中文选词不跳走。 */
function DraftTaskRow({
  item,
  index,
  inputRef,
  onChange,
  onRemove,
  projects,
  onItemProjectChange,
}: Pick<
  StageDraftListProps,
  'inputRef' | 'onChange' | 'onRemove' | 'projects' | 'onItemProjectChange'
> & {
  item: StageTaskDraft;
  index: number;
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
      <DraftProjectPicker
        projects={projects}
        projectId={item.projectId}
        label={'任务草稿 ' + (index + 1) + ' 项目'}
        onChange={(projectId) => onItemProjectChange(item.id, projectId)}
      />
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
  onItemProjectChange,
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
                projects={projects}
                onItemProjectChange={onItemProjectChange}
              />
            ))}
          </ul>
        )}
        <div
          className={
            'stage-draft-composer' + (projects.length ? ' has-project-picker' : '')
          }
        >
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
          <DraftProjectPicker
            projects={projects}
            projectId={projectId}
            label="阶段任务项目"
            onChange={onProjectChange}
          />
          <button type="button" onClick={onAdd} disabled={!pending.trim()}>
            添加 <CornerDownLeft size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="stage-draft-settings">
        <p id={hintId}>Enter 连续添加</p>
      </div>
    </section>
  );
}
