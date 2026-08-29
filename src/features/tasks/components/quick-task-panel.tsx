/**
 * @fileoverview 渲染无时间待办区域外壳；新增草稿和任务状态仍由 Dashboard 上层持有。
 */

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Surface } from '@/components/ui/surface';

type QuickTaskPanelChildren =
  ReactNode | ((controls: { isAdding: boolean; closeAdd: () => void }) => ReactNode);

/** 保持无时间待办的 drop 契约与标题区域；新增行开关由跨页面草稿控制器提供。 */
export function QuickTaskPanel({
  children,
  isDropTarget,
  isAdding,
  onAdd,
  onCloseAdd,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  children: QuickTaskPanelChildren;
  isDropTarget: boolean;
  isAdding: boolean;
  onAdd: () => void;
  onCloseAdd: () => void;
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
      {typeof children === 'function'
        ? children({ isAdding, closeAdd: onCloseAdd })
        : children}
    </Surface>
  );
}
