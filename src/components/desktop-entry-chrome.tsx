/** @fileoverview 登录及启动阶段的原生窗口控制，不依赖认证、业务数据或 DesktopWindowProvider。 */
'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Minus, X } from 'lucide-react';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';

/** Preload 生命周期内保持不变，无需事件订阅。 */
const subscribe = () => () => undefined;
/** 服务端不生成原生窗口控制；客户端检测受限 bridge。 */
const getSnapshot = () => Boolean(getMainDesktopBridge());
const getServerSnapshot = () => false;

/** 在登录门禁和启动遮罩内保持可见，首次显示时请求 Main 居中。 */
export function DesktopEntryChrome({
  purpose = 'startup',
}: {
  purpose?: 'startup' | 'authentication';
}) {
  const native = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (native)
      void getMainDesktopBridge()
        ?.showEntryWindow(purpose)
        .catch(() => undefined);
  }, [native, purpose]);
  if (!native) return null;
  return (
    <header className="desktop-entry-chrome">
      <span>Threadline</span>
      <div>
        <button
          type="button"
          aria-label="最小化窗口"
          onClick={() => void getMainDesktopBridge()?.minimizeMainWindow()}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="关闭窗口"
          onClick={() => void getMainDesktopBridge()?.closeMainWindow()}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
