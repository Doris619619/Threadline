/** @fileoverview 标题栏内的轻量更新入口，只有用户点击才显示详情，后台状态不打断工作。 */
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpCircle, X } from 'lucide-react';
import { useDesktopUpdate } from './update-runtime';
import { UpdateControls } from './update-controls';

/** 与原生标题栏保持同等鼠标密度；版本变化、下载完成均不自动展开面板。 */
export function DesktopUpdateEntry() {
  const { state } = useDesktopUpdate();
  const [position, setPosition] = useState<{ top: number; right: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = Boolean(
    state?.version &&
    ['available', 'downloading', 'downloaded', 'installing', 'error'].includes(
      state.status,
    ),
  );

  /** 面板属于非模态浮层；外部点击或调整窗口关闭，Escape 返回入口。 */
  useEffect(() => {
    if (!position || !visible) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    /** 关闭浮层但保留小型入口，不改变 Main 下载状态。 */
    const dismiss = () => setPosition(undefined);
    /** 只在入口与浮层外点击时收起，避免内部下载按钮被提前卸载。 */
    const onPointer = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        dismiss();
    };
    /** 键盘关闭后把焦点交回标题栏入口。 */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
    };
  }, [position, visible]);

  if (!state || !visible) return null;
  const label =
    state.status === 'downloaded'
      ? '重启更新'
      : state.status === 'downloading'
        ? '下载中'
        : state.status === 'installing'
          ? '更新中'
          : '更新';
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="desktop-update-trigger"
        aria-label={`软件更新：${label}`}
        title={`${state.status === 'downloading' ? `已下载 ${Math.round(state.percent ?? 0)}% · ` : ''}新版本 v${state.version}`}
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect();
          setPosition(
            position
              ? undefined
              : {
                  top: rect.bottom + 6,
                  right: Math.min(
                    Math.max(8, window.innerWidth - 288),
                    Math.max(8, window.innerWidth - rect.right),
                  ),
                },
          );
        }}
      >
        <ArrowUpCircle size={13} aria-hidden="true" />
        {label}
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            ref={panel}
            className="desktop-update-popover"
            role="region"
            aria-label="软件更新详情"
            style={position}
          >
            <div className="desktop-update-popover-heading">
              <strong>软件更新</strong>
              <button
                type="button"
                aria-label="关闭更新详情"
                onClick={() => {
                  setPosition(undefined);
                  trigger.current?.focus();
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <UpdateControls />
          </div>,
          document.body,
        )}
    </>
  );
}
