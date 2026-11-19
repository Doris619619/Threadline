/** @fileoverview 工作站引用行复用共享操作菜单，支持可见更多、右键和键盘；移出不删除原任务。 */
'use client';
import { useRef, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTaskMenu } from '../hooks/use-task-menu';
import { TaskActionsPopover } from './task-actions-popover';
import type { Task } from '@/types/domain';

/** 保留引用拖动排序；更多按钮和右键共用小窗内可滚动菜单，Escape 归还入口焦点。 */
export function WorkstationRow({
  task,
  index,
  label,
  onRemove,
  onReorder,
}: {
  task: Task;
  index: number;
  label: ReactNode;
  onRemove: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useTaskMenu();
  return (
    <li
      className="workstation-row"
      draggable
      tabIndex={0}
      aria-label={`${index + 1} ${task.title}`}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
      onDragStart={(event) => {
        if ((event.target as Element).closest('button')) {
          event.preventDefault();
          return;
        }
        menu.close();
        event.dataTransfer.setData('text/workstation-task-id', task.id);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData('text/workstation-task-id');
        if (source) onReorder(source, task.id);
      }}
    >
      <span className="workstation-order">{index + 1}</span>
      {label}
      <button
        ref={anchor}
        type="button"
        className="workstation-menu-trigger"
        aria-label={`${task.title}更多操作`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={menu.toggle}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {menu.open && (
        <TaskActionsPopover
          anchor={anchor}
          point={menu.point}
          className="workstation-context-menu"
          role="menu"
          label={`${task.title}的工作站操作`}
          onClose={menu.close}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              menu.close();
              onRemove(task.id);
            }}
          >
            移出工作站
          </button>
        </TaskActionsPopover>
      )}
    </li>
  );
}
