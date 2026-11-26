/** @fileoverview 工作站紧凑引用行，通过右键和键盘打开共享菜单；移出不删除原任务。 */
'use client';
import { useRef, type ReactNode } from 'react';
import { useTaskMenu } from '../hooks/use-task-menu';
import { TaskActionsPopover } from './task-actions-popover';
import type { Task } from '@/types/domain';

/** 保留单行标题与拖动排序；右键或键盘打开移出菜单，Escape 将焦点归还当前引用行。 */
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
  const anchor = useRef<HTMLLIElement>(null);
  const menu = useTaskMenu();
  return (
    <li
      ref={anchor}
      className="workstation-row"
      draggable
      tabIndex={0}
      aria-label={`${index + 1} ${task.title}，右键或 Shift+F10 移出工作站`}
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
