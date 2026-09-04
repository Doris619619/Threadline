/**
 * @fileoverview 任务行操作菜单与拖拽柄；桌面靠精确指针悬停，移动端收敛为纯净更多菜单。
 */

'use client';

import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { TaskStatus } from '@/types/domain';

/**
 * 渲染工作站开关、更多菜单和拖拽柄。移动端默认只展示干净的更多菜单，次要操作收敛到菜单内。
 */
export function TaskRowActions({
  taskId,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="task-actions-cell">
      <div className={cn('task-actions', menuOpen && 'is-open')} ref={rootRef}>
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
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={17} />
        </button>
        <div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
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
                setMenuOpen(false);
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
                setMenuOpen(false);
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
                setMenuOpen(false);
                onMove(taskId, 'abandoned');
              }}
            >
              放弃
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onMove(taskId, 'trashed');
            }}
          >
            <Trash2 size={13} />
            删除
          </button>
        </div>
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
