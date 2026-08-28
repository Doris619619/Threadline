/**
 * @fileoverview 管理完整工作台日程列的拖拽宽度，独立于任务拖放交互。
 */

import { useRef, useState } from 'react';

const DEFAULT_SCHEDULE_RATIO = 1.8;

/**
 * 返回日程列比例和 resize 起点处理器；窗口事件在本次拖拽结束时立即清理。
 */
export function useScheduleResize() {
  const [scheduleRatio, setScheduleRatio] = useState(DEFAULT_SCHEDULE_RATIO);
  const [isResizingSchedule, setIsResizingSchedule] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartRatioRef = useRef(DEFAULT_SCHEDULE_RATIO);

  const startResizeSchedule = (event: React.PointerEvent) => {
    setIsResizingSchedule(true);
    resizeStartXRef.current = event.clientX;
    resizeStartRatioRef.current = scheduleRatio;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaRatio = (moveEvent.clientX - resizeStartXRef.current) / 260;
      setScheduleRatio(Math.max(1.1, Math.min(3.2, resizeStartRatioRef.current + deltaRatio)));
    };
    const onPointerUp = () => {
      setIsResizingSchedule(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return { isResizingSchedule, scheduleRatio, startResizeSchedule };
}
