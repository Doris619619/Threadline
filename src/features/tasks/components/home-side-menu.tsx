/** @fileoverview 首页右栏使用互斥选择菜单，沿用 Daily 保存屏障并明确当前选项与忙碌状态。 */
'use client';

import { useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { TaskActionsPopover } from './task-actions-popover';

export type HomeSideView = 'tasks' | 'time' | 'memo';
const choices: { value: HomeSideView; label: string }[] = [
  { value: 'tasks', label: '任务列表' },
  { value: 'time', label: '今日时间分布' },
  { value: 'memo', label: '今日备忘录' },
];

/** 只委托原有切换命令；等待草稿确认期间禁止重复选择，完成后关闭并回到可聚焦的触发器。 */
export function HomeSideMenu({
  value,
  disabled = false,
  onChange,
}: {
  value: HomeSideView;
  disabled?: boolean;
  onChange: (value: HomeSideView) => Promise<void>;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const busy = disabled || selecting;
  const selected = choices.find((choice) => choice.value === value)!;

  /** 鼠标与键盘共用同一菜单，忙碌时保留焦点但不再次发起操作。 */
  function toggle() {
    if (!busy) setOpen((current) => !current);
  }

  /** 保存失败由工作台显示 Daily 行错误；菜单收起不改变工作台已选择的最终视图。 */
  async function choose(next: HomeSideView) {
    if (pending.current || busy) return;
    if (next === value) {
      setOpen(false);
      return;
    }
    pending.current = true;
    setSelecting(true);
    try {
      await onChange(next);
    } finally {
      pending.current = false;
      setSelecting(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="home-side-menu-trigger"
        aria-label={`右栏显示内容：${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-disabled={busy}
        aria-busy={busy}
        onClick={toggle}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key) && !busy) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <TaskActionsPopover
          id={id}
          anchor={trigger}
          role="menu"
          className="home-side-menu"
          label="右栏显示内容"
          align="start"
          onClose={() => setOpen(false)}
        >
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice.value === value}
              disabled={busy}
              onClick={() => void choose(choice.value)}
            >
              <span className="menu-check" aria-hidden="true">
                {choice.value === value && <Check size={16} />}
              </span>
              <span>{choice.label}</span>
            </button>
          ))}
        </TaskActionsPopover>
      )}
    </>
  );
}
