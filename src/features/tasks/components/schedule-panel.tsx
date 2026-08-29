/**
 * @fileoverview 渲染日程区域外壳；新增草稿和任务状态仍由 Dashboard 上层持有。
 */

import type { ReactNode } from 'react';
import { Eraser, GripVertical, MousePointer2, Plus } from 'lucide-react';
import { AnnotationColorPicker } from '@/components/annotation-color-picker';
import { Surface } from '@/components/ui/surface';
import type { AnnotationTool } from '@/components/annotation-layer';

type SchedulePanelChildren =
  ReactNode | ((controls: { isAdding: boolean; closeAdd: () => void }) => ReactNode);

/** 保持日程 drop 契约、批注工具和 resize 控制；新增行开关由跨页面草稿控制器提供。 */
export function SchedulePanel({
  children,
  annotationTool,
  highlightColor,
  isDropTarget,
  isFullWorkspace,
  isResizing,
  isAdding,
  onAdd,
  onCloseAdd,
  onDragLeave,
  onDragOver,
  onDrop,
  onResizeStart,
  onSelectAnnotationTool,
  onToggleEraser,
  onSetHighlightColor,
}: {
  children: SchedulePanelChildren;
  annotationTool: AnnotationTool;
  highlightColor: string;
  isDropTarget: boolean;
  isFullWorkspace: boolean;
  isResizing: boolean;
  isAdding: boolean;
  onAdd: () => void;
  onCloseAdd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onResizeStart: (event: React.PointerEvent) => void;
  onSelectAnnotationTool: (tool: 'none' | 'highlight') => void;
  onToggleEraser: () => void;
  onSetHighlightColor: (color: string) => void;
}) {
  return (
    <Surface
      className={`schedule-panel${isDropTarget ? 'is-drop-target' : ''}`}
      data-task-drop-zone="schedule"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="schedule-panel-header">
        <h2>今日日程</h2>
        <div className="schedule-panel-actions">
          <div className="annotation-tools" role="group" aria-label="批注工具">
            <button
              type="button"
              className={`annotation-tool-btn${annotationTool === 'none' ? 'is-active' : ''}`}
              aria-label="选择模式"
              title="选择模式"
              onClick={() => onSelectAnnotationTool('none')}
            >
              <MousePointer2 size={15} />
            </button>
            <AnnotationColorPicker
              active={annotationTool === 'highlight'}
              color={highlightColor}
              onActivate={() => onSelectAnnotationTool('highlight')}
              onColorChange={onSetHighlightColor}
            />
            <button
              type="button"
              className={`annotation-tool-btn${annotationTool === 'eraser' ? 'is-active' : ''}`}
              aria-label="橡皮擦"
              title="橡皮擦（Esc 退出）"
              onClick={onToggleEraser}
            >
              <Eraser size={15} />
            </button>
          </div>
          <button className="add-link" onClick={onAdd}>
            <Plus size={19} /> 添加
          </button>
          {isFullWorkspace && (
            <button
              type="button"
              className={`schedule-resize-handle ${isResizing ? 'is-resizing' : ''}`}
              onPointerDown={onResizeStart}
              title="按住向右拖动以扩展今日日程宽度"
            >
              <GripVertical size={16} />
            </button>
          )}
        </div>
      </header>
      {typeof children === 'function'
        ? children({ isAdding, closeAdd: onCloseAdd })
        : children}
    </Surface>
  );
}
