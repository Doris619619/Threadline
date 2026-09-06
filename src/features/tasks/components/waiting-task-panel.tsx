/** @fileoverview 渲染跨日期持续的待安排池，并以轻量重要性分组承载创建入口。 */

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/cn';

/** 在一个 Surface 内按重要性分组，避免把待安排拆成两张巨型卡片。 */
export function WaitingTaskPanel({
  children,
  isDropTarget,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  children: ReactNode;
  isDropTarget: boolean;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  return (
    <Surface
      className={cn('waiting-panel', isDropTarget && 'is-drop-target')}
      data-task-drop-zone="waiting"
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header>
        <h2>待安排</h2>
      </header>
      {children}
    </Surface>
  );
}

/** 分类标题和添加入口常显，空组也能直接新增对应的重要或普通事项。 */
export function WaitingTaskGroup({
  importance,
  count,
  onAdd,
  children,
}: {
  importance: 'important' | 'normal';
  count: number;
  onAdd: () => void;
  children: ReactNode;
}) {
  const title = importance === 'important' ? '重要' : '普通';
  return (
    <section className="waiting-group" aria-label={`${title}待安排`}>
      <header>
        <h3>
          {title}
          <span className="waiting-group-count">{count}</span>
        </h3>
        <button
          className="add-link"
          type="button"
          aria-label={`添加${title}事项`}
          onClick={onAdd}
        >
          <Plus size={18} aria-hidden="true" />
          添加{title}
        </button>
      </header>
      {children}
    </section>
  );
}
