/** @fileoverview 订阅 Main 更新状态，在任何页面显示非模态新版提示，并提供设置页更新操作。 */
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import type { DesktopUpdateState } from '@/lib/desktop-update';
import { ManagementDialog } from '@/components/ui/management-dialog';
import {
  getPendingCloudWrites,
  lockForDesktopUpdate,
  subscribeCloudWrites,
} from '@/lib/cloud-write-guard';

const UpdateContext = createContext<{
  state?: DesktopUpdateState;
  run: (action: 'check' | 'download' | 'install') => Promise<void>;
}>({ run: async () => undefined });
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

/** 先订阅后读取，并用 revision 合并 IPC 返回和广播，避免快速状态被旧快照覆盖。 */
export function DesktopUpdateRuntime({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesktopUpdateState>();
  const [notice, setNotice] = useState<string>();
  const [dismissed, setDismissed] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const pending = useSyncExternalStore(
    subscribeCloudWrites,
    getPendingCloudWrites,
    () => 0,
  );
  const installation = useRef<{ unlock: () => void; failed: boolean } | undefined>(
    undefined,
  );
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge?.onUpdateState) return;
    let alive = true;
    let latestRevision = -1;
    /** 同一个窗口只接受更高 revision。 */
    const apply = (next: DesktopUpdateState) => {
      if (!alive || next.revision < latestRevision) return;
      latestRevision = next.revision;
      if (installation.current && next.status === 'downloaded') {
        installation.current.failed = true;
        installation.current.unlock();
      }
      if (alive)
        setState((current) =>
          !current || next.revision >= current.revision ? next : current,
        );
    };
    const unsubscribe = bridge.onUpdateState(apply);
    void bridge
      .getUpdateState()
      .then(apply)
      .catch(() => setNotice('无法读取更新状态，请重新打开应用。'));
    return () => {
      alive = false;
      unsubscribe();
      installation.current?.unlock();
    };
  }, []);
  /** 安装前独占写入；取消、IPC 失败和 Main 安装失败均释放。 */
  async function run(action: 'check' | 'download' | 'install', confirmed = false) {
    if (action === 'install' && !confirmed) {
      setConfirming(true);
      return;
    }
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    let unlock: (() => void) | undefined;
    setNotice(undefined);
    try {
      if (action === 'install') {
        unlock = lockForDesktopUpdate();
        installation.current = { unlock, failed: false };
      }
      const next = await (action === 'check'
        ? bridge.checkForUpdate()
        : action === 'download'
          ? bridge.downloadUpdate()
          : bridge.installUpdate());
      setState((current) =>
        !current || next.revision >= current.revision ? next : current,
      );
      // 确认后保持锁到进程退出；Main 失败事件负责恢复。
      if (next.status === 'installing' && unlock && !installation.current?.failed) {
        unlock = undefined;
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '更新操作失败，请重试。');
    } finally {
      unlock?.();
    }
  }
  const banner =
    state &&
    ['available', 'downloading', 'downloaded', 'installing'].includes(state.status) &&
    dismissed !== `${state.version}:${state.status}`;
  return (
    <UpdateContext.Provider value={{ state, run }}>
      {children}
      {confirming && (
        <div className="desktop-update-confirmation">
          <ManagementDialog title="重启并更新" onClose={() => setConfirming(false)}>
            <p>
              现在重启 Threadline 并安装新版？请先完成当前编辑，账号和已有数据会保留。
            </p>
            {pending > 0 && <p role="status">正在保存，请稍候。</p>}
            <div className="desktop-update-actions">
              <button
                type="button"
                className="tl-button tl-button--secondary"
                data-management-initial-focus
                onClick={() => setConfirming(false)}
              >
                稍后
              </button>
              <button
                type="button"
                className="tl-button tl-button--primary"
                disabled={pending > 0}
                onClick={() => {
                  setConfirming(false);
                  void run('install', true);
                }}
              >
                重启并更新
              </button>
            </div>
          </ManagementDialog>
        </div>
      )}
      {banner && (
        <aside className="desktop-update-notice" aria-label="软件更新">
          <UpdateControls />
          {!['downloading', 'installing'].includes(state.status) && (
            <button
              type="button"
              className="tl-button tl-button--secondary"
              onClick={() => setDismissed(`${state.version}:${state.status}`)}
            >
              稍后
            </button>
          )}
        </aside>
      )}
      {notice && (
        <aside className="desktop-update-notice" role="alert">
          <p>{notice}</p>
          <button
            type="button"
            className="tl-button tl-button--secondary"
            onClick={() => setNotice(undefined)}
          >
            关闭
          </button>
        </aside>
      )}
    </UpdateContext.Provider>
  );
}

/** Web 无 bridge 时不渲染；按钮和进度在设置页与全局提示中共享真实状态。 */
export function UpdateControls() {
  const { state, run } = useContext(UpdateContext);
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
