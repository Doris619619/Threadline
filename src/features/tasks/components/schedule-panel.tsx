/**
 * @fileoverview 按左右分组呈现日程标题工具与创建入口，面板边缘承载调宽手柄；业务草稿仍由上层持有。
 */

import type { ReactNode } from 'react';
import { Eraser, Plus } from 'lucide-react';
import { AnnotationColorPicker } from '@/components/annotation-color-picker';
import { cn } from '@/lib/cn';
import { Surface } from '@/components/ui/surface';
import type { AnnotationTool } from '@/components/annotation-layer';

type SchedulePanelChildren =
  ReactNode | ((controls: { isAdding: boolean; closeAdd: () => void }) => ReactNode);

/** 标记工具靠近标题、创建任务留在右侧；重复点击已启用的荧光笔或按 Esc 回到普通交互，原拖拽契约不变。 */
export function SchedulePanel({
  children,
  annotationTool,
  highlightColor,
  isDropTarget,
  isFullWorkspace,
  sideCollapsed = false,
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
  importAction,
}: {
  children: SchedulePanelChildren;
  importAction?: ReactNode;
  annotationTool: AnnotationTool;
  highlightColor: string;
  isDropTarget: boolean;
  isFullWorkspace: boolean;
  sideCollapsed?: boolean;
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
      className={cn('schedule-panel', isDropTarget && 'is-drop-target')}
      data-task-drop-zone="schedule"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="schedule-panel-header">
        <div className="schedule-panel-heading">
          <h2>今日日程</h2>
          <div className="annotation-tools" role="group" aria-label="批注工具">
            <AnnotationColorPicker
              active={annotationTool === 'highlight'}
              color={highlightColor}
              onActivate={() => onSelectAnnotationTool('highlight')}
              onDeactivate={() => onSelectAnnotationTool('none')}
              onColorChange={onSetHighlightColor}
            />
            <button
              type="button"
              className={cn(
                'annotation-tool-btn',
                annotationTool === 'eraser' && 'is-active',
              )}
              aria-label="橡皮擦"
              aria-pressed={annotationTool === 'eraser'}
              title="橡皮擦（Esc 退出）"
              onClick={onToggleEraser}
            >
              <Eraser size={15} />
            </button>
          </div>
        </div>
        <div className="schedule-panel-actions">
          {importAction}
          <button type="button" className="schedule-add-button" onClick={onAdd}>
            <Plus size={18} aria-hidden="true" /> 添加
          </button>
        </div>
      </header>
      {isFullWorkspace && !sideCollapsed && (
        <button
          type="button"
          className={cn('schedule-resize-handle', isResizing && 'is-resizing')}
          onPointerDown={onResizeStart}
          aria-label="调整今日日程宽度"
          title="按住向右拖动以扩展今日日程宽度"
        />
      )}
      {typeof children === 'function'
        ? children({ isAdding, closeAdd: onCloseAdd })
        : children}
    </Surface>
  );
}
