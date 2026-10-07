/** @fileoverview 到时倒计时的预设与自定义续时面板；复用原生顶层浮层，不改变卡片布局。 */
'use client';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
  type RefObject,
} from 'react';
import { TaskActionsPopover } from './task-actions-popover';

const PRESET_MINUTES = [5, 10, 15, 30] as const;

/** 面板按卡片定位而焦点回到延长按钮；预设直接提交，自定义在同一浮层校验整数。 */
export function TaskTimerExtension({
  anchor,
  positionAnchor,
  elapsedMs,
  onExtend,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  positionAnchor: RefObject<HTMLElement | null>;
  elapsedMs: number;
  onExtend: (minutes: number) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  /** 切换自定义后直接聚焦输入，不滚动页面或重新打开另一层对话框。 */
  useLayoutEffect(() => {
    if (custom) input.current?.focus({ preventScroll: true });
  }, [custom]);

  /** 自定义始终沿用当前浮层；输入错误只在提交时出现，重新输入即清除。 */
  function changeMinutes(event: ChangeEvent<HTMLInputElement>) {
    setMinutes(event.target.value);
    setError('');
  }

  /** 在同一面板切换到分钟输入，焦点由布局回调交给输入框。 */
  function openCustom() {
    setCustom(true);
  }

  /** 原生表单支持 Enter；只有 1–1440 的整数分钟能进入续时规则。 */
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(minutes.trim());
    if (!/^\d+$/.test(minutes.trim()) || value < 1 || value > 1440) {
      setError('请输入 1—1440 的整数分钟。');
      input.current?.focus({ preventScroll: true });
      return;
    }
    onExtend(value);
  }

  return (
    <TaskActionsPopover
      anchor={anchor}
      positionAnchor={positionAnchor}
      label="延长倒计时"
      className="task-timer-extension"
      onClose={onClose}
    >
      <p className="task-timer-extension-elapsed">
        已用 {Math.round(elapsedMs / 60000)} 分钟
      </p>
      {custom ? (
        <form onSubmit={confirm} className="task-timer-extension-form">
          <label htmlFor={inputId}>延长分钟</label>
          <input
            ref={input}
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={minutes}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={changeMinutes}
          />
          {error && (
            <p id={errorId} role="alert" className="form-error">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit">确认</button>
          </footer>
        </form>
      ) : (
        <>
          <div className="task-timer-extension-presets">
            {PRESET_MINUTES.map((value) => (
              <button key={value} type="button" onClick={() => onExtend(value)}>
                {value}分钟
              </button>
            ))}
          </div>
          <button
            type="button"
            className="task-timer-extension-custom"
            onClick={openCustom}
          >
            自定义
          </button>
        </>
      )}
    </TaskActionsPopover>
  );
}
