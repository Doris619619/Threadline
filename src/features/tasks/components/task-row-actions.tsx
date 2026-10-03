/**
 * @fileoverview 任务行操作按钮与拖拽柄；点击打开顶层菜单，悬停只显示入口、不改变列表尺寸。
 */

'use client';

import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTaskMenu } from '../hooks/use-task-menu';
import { useRef, type RefObject } from 'react';
import { TaskActionsPopover } from './task-actions-popover';
import { TaskTimerMenuAction } from './task-timer-menu-action';
import { cn } from '@/lib/cn';
import type { TaskStatus } from '@/types/domain';

/**
 * 渲染工作站开关、更多菜单和拖拽柄。移动端默认只展示干净的更多菜单，次要操作收敛到菜单内。
 */
export function TaskRowActions({
  taskId,
  menu: controlledMenu,
  menuAnchor: controlledAnchor,
  title,
  canChangeWorkflow,
  canDrag,
  editingLocked,
  inWorkstation,
  onEdit,
  onMove,
  onReschedule,
  onToggleWorkstation,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
}: {
  taskId: string;
  menu?: ReturnType<typeof useTaskMenu>;
  menuAnchor?: RefObject<HTMLButtonElement | null>;
  title: string;
  canChangeWorkflow: boolean;
  canDrag: boolean;
  editingLocked: boolean;
  inWorkstation: boolean;
  onEdit: () => void;
  onMove: (id: string, status: TaskStatus) => void;
  onReschedule: () => void;
  onToggleWorkstation?: (taskId: string) => void;
  onPointerDragStart?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerDragMove?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerDragEnd?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const localMenu = useTaskMenu();
  const localAnchor = useRef<HTMLButtonElement>(null);
  const menu = controlledMenu ?? localMenu;
  const menuAnchor = controlledAnchor ?? localAnchor;
  return (
    <div className="task-actions-cell">
      <div className={cn('task-actions', menu.open && 'is-open')}>
        {onToggleWorkstation && (
          <button
            type="button"
            className={cn('task-workstation-action', inWorkstation && 'is-active')}
            aria-label={`${inWorkstation ? '从工作站移除' : '加入工作站'}${title}`}
            title={inWorkstation ? '从工作站移除' : '加入工作站'}
            onClick={() => onToggleWorkstation(taskId)}
          >
            <Plus size={15} />
          </button>
        )}
        <button
          type="button"
          aria-label={`${title}更多操作`}
          ref={menuAnchor}
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          <MoreHorizontal size={17} />
        </button>
        {menu.open && (
          <TaskActionsPopover
            anchor={menuAnchor}
            point={menu.point}
            onClose={menu.close}
            label={`${title}操作`}
          >
            {canChangeWorkflow && (
              <TaskTimerMenuAction taskId={taskId} onClose={menu.close} />
            )}
            <button
              type="button"

              onClick={() => {
                menu.close();
                onEdit();
              }}
            >
              <Pencil size={13} />
              详细编辑
            </button>
            {canChangeWorkflow && (
              <button
                type="button"

                onClick={() => {
                  menu.close();
                  onReschedule();
                }}
              >
                移期
              </button>
            )}
            {canChangeWorkflow && (
              <button
                type="button"

                onClick={() => {
                  menu.close();
                  onMove(taskId, 'waiting');
                }}
              >
                待安排
              </button>
            )}
            {canChangeWorkflow && (
              <button
                type="button"

                onClick={() => {
                  menu.close();
                  onMove(taskId, 'abandoned');
                }}
              >
                放弃
              </button>
            )}
            <button
              type="button"

              onClick={() => {
                menu.close();
                onMove(taskId, 'trashed');
              }}
            >
              <Trash2 size={13} />
              删除
            </button>
          </TaskActionsPopover>
        )}
      </div>
      <button
        type="button"
        className="task-drag-handle"
        aria-label={`拖动${title}`}
        title="按住并拖到另一面板"
        disabled={!canDrag || editingLocked}
        onPointerDown={onPointerDragStart}
        onPointerMove={onPointerDragMove}
        onPointerUp={onPointerDragEnd}
      >
        <GripVertical size={16} />
      </button>
    </div>
  );
}
