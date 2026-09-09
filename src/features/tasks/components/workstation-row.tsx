/** @fileoverview 工作站引用行与不占列表宽度的右键菜单；移出不会删除原任务。 */
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Task } from '@/types/domain';

/** 支持拖动排序、右键及 Shift+F10；菜单在当前小窗内定位，关闭后返回行焦点。 */
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
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** 菜单必须完全落在便签视口中，避免最右或最下方任务无法操作。 */
  function openMenu(x: number, y: number) {
    setMenu({
      x: Math.max(4, Math.min(x, window.innerWidth - 148)),
      y: Math.max(4, Math.min(y, window.innerHeight - 42)),
    });
  }
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    /** 外部点击或窗口失焦收起菜单；不改变引用或正在操作的其他控件。 */
    function dismiss(event: Event) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target))
        return;
      setMenu(null);
    }
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [menu]);
  return (
    <li
      ref={rowRef}
      className="workstation-row"
      draggable
      tabIndex={0}
      aria-label={`${index + 1} ${task.title}，右键或 Shift+F10 移出工作站`}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          openMenu(bounds.left, bounds.bottom);
        }
      }}
      onDragStart={(event) => {
        setMenu(null);
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
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="workstation-context-menu"
            role="menu"
            aria-label={`${task.title}的工作站操作`}
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                setMenu(null);
                rowRef.current?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onRemove(task.id);
              }}
            >
              移出工作站
            </button>
          </div>,
          document.body,
        )}
    </li>
  );
}
