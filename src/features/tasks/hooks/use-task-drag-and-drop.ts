/**
 * @fileoverview 管理任务的浏览器原生拖放和 WebView2 Pointer fallback，不处理任务持久化。
 */

import { useRef, useState } from 'react';

type TaskDropZone = 'schedule' | 'waiting';

/**
 * 将纯交互状态与落点识别封装起来；调用方提供实际的任务移动动作。
 */
export function useTaskDragAndDrop({
  interactionLocked,
  onMoveToWaiting,
  onMoveToSchedule,
}: {
  interactionLocked: boolean;
  onMoveToWaiting: (taskId: string) => void;
  onMoveToSchedule: (taskId: string) => void;
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskDropZone | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const pointerDragRef = useRef<{ taskId: string; pointerId: number } | undefined>(
    undefined,
  );

  /** 记录拖拽源以呈现视觉反馈，不锁定原生 drop 事件。 */
  const handleTaskDragStart = (taskId: string) => {
    if (interactionLocked) return;
    draggingTaskIdRef.current = taskId;
    setDraggingTaskId(taskId);
  };

  /** 无论落点是否有效，都清理本次原生拖拽的临时视觉状态。 */
  const handleTaskDragEnd = () => {
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDropTarget(null);
  };

  /** 从标准或自定义载荷读取任务 ID，兼容 WebView 未回传的情况。 */
  const getDraggedTaskId = (event: React.DragEvent) =>
    event.dataTransfer.getData('text/task-id') ||
    event.dataTransfer.getData('text/plain') ||
    draggingTaskIdRef.current;

  /** 从当前坐标解析带 data-task-drop-zone 的有效面板。 */
  const getDropZoneAtPoint = (clientX: number, clientY: number): TaskDropZone | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const zone = element?.closest<HTMLElement>('[data-task-drop-zone]')?.dataset
      .taskDropZone;
    return zone === 'schedule' || zone === 'waiting' ? zone : null;
  };

  /** 统一结束 Pointer fallback，并只调用调用方提供的持久化移动动作。 */
  const finishPointerDrag = (pointerId: number, clientX: number, clientY: number) => {
    const activePointerDrag = pointerDragRef.current;
    const taskId = activePointerDrag?.taskId ?? draggingTaskIdRef.current;
    if (!taskId || (activePointerDrag && pointerId !== activePointerDrag.pointerId)) return;
    const target = getDropZoneAtPoint(clientX, clientY);
    if (target === 'schedule') onMoveToSchedule(taskId);
    if (target === 'waiting') onMoveToWaiting(taskId);
    pointerDragRef.current = undefined;
    handleTaskDragEnd();
  };

  /** 从明确拖拽柄启动 WebView2 稳定的鼠标 Pointer 路径。 */
  const handlePointerDragStart = (
    taskId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (interactionLocked || event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDragRef.current = { taskId, pointerId: event.pointerId };
    draggingTaskIdRef.current = taskId;
    setDraggingTaskId(taskId);
    const finishFromWindow = (nativeEvent: PointerEvent) => {
      finishPointerDrag(nativeEvent.pointerId, nativeEvent.clientX, nativeEvent.clientY);
      window.removeEventListener('pointerup', finishFromWindow, true);
    };
    window.addEventListener('pointerup', finishFromWindow, true);
  };

  /** 随鼠标移动高亮 Pointer fallback 的有效落点。 */
  const handlePointerDragMove = (event: React.PointerEvent) => {
    const activePointerDrag = pointerDragRef.current;
    if (!activePointerDrag || event.pointerId !== activePointerDrag.pointerId) return;
    const target = getDropZoneAtPoint(event.clientX, event.clientY);
    setDropTarget((current) => (current === target ? current : target));
  };

  /** 松开明确拖拽柄后按落点完成移动。 */
  const handlePointerDragEnd = (event: React.PointerEvent) =>
    finishPointerDrag(event.pointerId, event.clientX, event.clientY);

  /** 允许浏览器原生拖拽进入日程区域。 */
  const handleScheduleDragOver = (event: React.DragEvent) => {
    if (interactionLocked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget('schedule');
  };

  /** 将原生拖放的任务放入日程区域。 */
  const handleScheduleDrop = (event: React.DragEvent) => {
    if (interactionLocked) return;
    event.preventDefault();
    setDropTarget(null);
    const taskId = getDraggedTaskId(event);
    if (!taskId) return;
    onMoveToSchedule(taskId);
    handleTaskDragEnd();
  };

  /** 允许浏览器原生拖拽进入持续待安排区域。 */
  const handleWaitingDragOver = (event: React.DragEvent) => {
    if (interactionLocked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget('waiting');
  };

  /** 将原生拖放的任务原子移回持续待安排区域。 */
  const handleWaitingDrop = (event: React.DragEvent) => {
    if (interactionLocked) return;
    event.preventDefault();
    setDropTarget(null);
    const taskId = getDraggedTaskId(event);
    if (!taskId) return;
    onMoveToWaiting(taskId);
    handleTaskDragEnd();
  };

  return {
    draggingTaskId,
    dropTarget,
    handlePointerDragEnd,
    handlePointerDragMove,
    handlePointerDragStart,
    handleWaitingDragOver,
    handleWaitingDrop,
    handleScheduleDragOver,
    handleScheduleDrop,
    handleTaskDragEnd,
    handleTaskDragStart,
    setDropTarget,
  };
}
