/** @fileoverview 设置页与更新详情浮层共用的状态、下载进度和安装操作。 */
'use client';
import { useSyncExternalStore } from 'react';
import type { DesktopUpdateState } from '@/lib/desktop-update';
import { getPendingCloudWrites, subscribeCloudWrites } from '@/lib/cloud-write-guard';
import { useDesktopUpdate } from './update-runtime';
const labels: Record<DesktopUpdateState['status'], string> = {
  unavailable: '此版本不支持自动更新',
  idle: '可检查是否有新版本',
  checking: '可检查是否有新版本',
  available: '发现新版本',
  current: '已是最新版本',
  downloading: '正在下载更新',
  downloaded: '更新已下载',
  installing: '正在重启更新…',
  error: '更新未完成',
};

/** Web 无 bridge 时不渲染；共享真实更新阶段及未完成写入的静态阻止原因。 */
export function UpdateControls() {
  const { state, displayedState, run } = useDesktopUpdate();
  const pending = useSyncExternalStore(
    subscribeCloudWrites,
    getPendingCloudWrites,
    () => 0,
  );
  if (!state) return null;
  const displayed = displayedState ?? state;
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  return (
    <div className="desktop-update-controls">
      <p role="status">
        {labels[displayed.status]}
        {displayed.version ? ` · ${displayed.version}` : ''}
      </p>
      {displayed.message && <p>{displayed.message}</p>}
      {state.status === 'downloading' && (
        <progress aria-label="更新下载进度" value={state.percent ?? 0} max={100} />
      )}
      {state.status === 'downloading' && <p>{Math.round(state.percent ?? 0)}%</p>}
      {state.status !== 'unavailable' && (
        <button
          type="button"
          className="tl-button tl-button--primary"
          disabled={busy || (state.status === 'downloaded' && pending > 0)}
          aria-busy={busy}
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
          {displayed.status === 'available'
            ? '下载更新'
            : displayed.status === 'downloaded'
              ? '重启并更新'
              : state.status === 'downloading' || state.status === 'installing'
                ? labels[state.status]
                : '检查更新'}
        </button>
      )}
      {displayed.status === 'downloaded' && <p>重启更新前需要完成所有数据写入。</p>}
    </div>
  );
}
