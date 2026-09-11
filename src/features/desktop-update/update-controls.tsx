/** @fileoverview 设置页与更新详情浮层共用的状态、下载进度和安装操作。 */
'use client';
import { useSyncExternalStore } from 'react';
import type { DesktopUpdateState } from '@/lib/desktop-update';
import { getPendingCloudWrites, subscribeCloudWrites } from '@/lib/cloud-write-guard';
import { useDesktopUpdate } from './update-runtime';
const labels: Record<DesktopUpdateState['status'], string> = {
  unavailable: '此版本不支持自动更新',
  idle: '可检查是否有新版本',
  checking: '正在检查更新…',
  available: '发现新版本',
  current: '已是最新版本',
  downloading: '正在下载更新',
  downloaded: '更新已下载',
  installing: '正在重启更新…',
  error: '更新未完成',
};

/** Web 无 bridge 时不渲染；按钮和进度在设置页与全局提示中共享真实状态。 */
export function UpdateControls() {
  const { state, run } = useDesktopUpdate();
  const pending = useSyncExternalStore(
    subscribeCloudWrites,
    getPendingCloudWrites,
    () => 0,
  );
  if (!state) return null;
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  return (
    <div className="desktop-update-controls">
      <p role="status">
        {labels[state.status]}
        {state.version ? ` · ${state.version}` : ''}
      </p>
      {state.message && <p>{state.message}</p>}
      {state.status === 'downloading' && (
        <progress aria-label="更新下载进度" value={state.percent ?? 0} max={100} />
      )}
      {state.status === 'downloading' && <p>{Math.round(state.percent ?? 0)}%</p>}
      {state.status !== 'unavailable' && (
        <button
          type="button"
          className="tl-button tl-button--primary"
          disabled={busy || (state.status === 'downloaded' && pending > 0)}
          onClick={() =>
            void run(
              state.status === 'available'
                ? 'download'
                : state.status === 'downloaded'
                  ? 'install'
                  : 'check',
            )
          }
        >
          {state.status === 'available'
            ? '下载更新'
            : state.status === 'downloaded'
              ? '重启并更新'
              : busy
                ? labels[state.status]
                : '检查更新'}
        </button>
      )}
      {state.status === 'downloaded' && pending > 0 && (
        <p role="status">正在保存，完成后可重启更新。</p>
      )}
    </div>
  );
}
