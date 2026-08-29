/**
 * @fileoverview 渲染无时间待办区域外壳；新增草稿和任务状态仍由 Dashboard 上层持有。
 */

import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Surface } from '@/components/ui/surface';

type QuickTaskPanelChildren =
  | ReactNode
  | ((controls: { isAdding: boolean; closeAdd: () => void }) => ReactNode);

/** 保持无时间待办的 drop 契约与标题区域，新增行开关状态归属于待办区域。 */
export function QuickTaskPanel({
  children,
  isDropTarget,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  children: QuickTaskPanelChildren;
  isDropTarget: boolean;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
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
        <button className="add-link" onClick={() => setIsAdding(true)}>
          <Plus size={19} /> 添加
        </button>
      </header>
      {typeof children === 'function'
        ? children({ isAdding, closeAdd: () => setIsAdding(false) })
        : children}
    </Surface>
  );
}
