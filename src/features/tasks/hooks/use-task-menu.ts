/** @fileoverview 为任务行和计时卡共用右键、键盘菜单及点击入口的状态，输入框保留原生编辑菜单。 */
'use client';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';

export type TaskMenuPoint = { x: number; y: number };

/** 右键按指针位置展开；Shift+F10/菜单键按焦点控件展开，触屏用同一个更多按钮。 */
export function useTaskMenu() {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<TaskMenuPoint>();
  /** 输入控件保留系统菜单，以免打断选择、复制和粘贴。 */
  function onContextMenu(event: MouseEvent<HTMLElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    setPoint({ x: event.clientX, y: event.clientY });
    setOpen(true);
  }
  /** 键盘菜单定位到实际焦点所在控件，而非可能很高的整行底部。 */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    event.stopPropagation();
    const target =
      event.target instanceof HTMLElement ? event.target : event.currentTarget;
    const bounds = target.getBoundingClientRect();
    setPoint({ x: bounds.left, y: bounds.bottom });
    setOpen(true);
  }
  /** 点击入口按触发器定位，清掉上一次右键的指针坐标。 */
  function toggle() {
    setPoint(undefined);
    setOpen((value) => !value);
  }
  /** 菜单完成、Escape 或外部点击均收起同一份菜单。 */
  function close() {
    setOpen(false);
  }
  return { open, point, onContextMenu, onKeyDown, toggle, close };
}
