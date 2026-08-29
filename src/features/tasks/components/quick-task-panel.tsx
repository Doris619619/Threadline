/**
 * @fileoverview 渲染无时间待办区域外壳；新增草稿和任务状态仍由 Dashboard 上层持有。
 */

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Surface } from '@/components/ui/surface';

/** 保持无时间待办的 drop 契约与标题区域，内部行内容由调用方原样传入。 */
export function QuickTaskPanel({
  children,
  isDropTarget,
  onAdd,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  children: ReactNode;
  isDropTarget: boolean;
  onAdd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  return (
    <Surface
      className={`quick-panel${isDropTarget ? 'is-drop-target' : ''}`}
      data-task-drop-zone="quick"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header>
        <h2>无时间待办</h2>
        <button className="add-link" onClick={onAdd}>
          <Plus size={19} /> 添加
        </button>
      </header>
      {children}
    </Surface>
  );
}
