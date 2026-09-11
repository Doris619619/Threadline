/** @fileoverview 订阅 Main 更新状态并共享操作，统一安装确认、保存保护与 IPC 错误反馈。 */
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
/** 读取 Main 更新状态与受保存保护的操作入口。 */
export function useDesktopUpdate() {
  return useContext(UpdateContext);
}

export { UpdateControls } from './update-controls';

/** 先订阅后读取，并用 revision 合并 IPC 返回和广播，避免快速状态被旧快照覆盖。 */
export function DesktopUpdateRuntime({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesktopUpdateState>();
  const [notice, setNotice] = useState<string>();
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
