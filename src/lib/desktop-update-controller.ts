/** @fileoverview 管理下载状态与并发；通过注入 updater 使网络和安装生命周期可以独立验证。 */
import type { DesktopUpdateState } from './desktop-update.js';
import type { AppUpdater } from 'electron-updater';

/** 更新器只接受官方 provider 的结果，Renderer 不能指定版本或下载 URL。 */
export class UpdateController {
  private state: DesktopUpdateState;
  private active = false;
  /** 固定安全更新策略，并将下载事件转为可订阅状态。 */
  constructor(
    private updater: AppUpdater,
    version: string,
    enabled: boolean,
    private publish: (state: DesktopUpdateState) => void,
  ) {
    this.state = {
      revision: 0,
      currentVersion: version,
      status: enabled ? 'idle' : 'unavailable',
      message: enabled ? undefined : '请安装正式安装包后使用自动更新。',
    };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.on('download-progress', (progress) => {
      if (this.state.status === 'downloading')
        this.set({ percent: Math.min(100, Math.max(0, progress.percent)) });
    });
    // error 事件必须消费；操作 promise 决定最终状态，避免旧事件覆盖新操作。
    updater.on('error', () => {
      if (this.state.status === 'installing')
        this.set({ status: 'downloaded', message: '启动安装失败，请重试。' });
    });
  }
  /** 返回副本，防止调用者修改 Main 权威状态。 */
  getState() {
    return { ...this.state };
  }
  /** 每次广播递增 revision，Renderer 丢弃迟到的初始读取。 */
  private set(patch: Partial<DesktopUpdateState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.publish(this.getState());
  }
  /** 检查与下载互斥；已下载版本必须保持可安装，不能被后台检查清除。 */
  async check() {
    if (
      this.active ||
      ['unavailable', 'downloaded', 'installing'].includes(this.state.status)
    )
      return this.getState();
    this.active = true;
    this.set({
      status: 'checking',
      message: undefined,
      percent: undefined,
      version: undefined,
    });
    try {
      const result = await this.updater.checkForUpdates();
      const candidate = result?.updateInfo.version;
      // updater 本身执行 semver 检查；这里只接受严格递增的稳定三段版本。
      const newer =
        candidate &&
        /^\d+\.\d+\.\d+$/.test(candidate) &&
        candidate
          .split('.')
          .map(Number)
          .some(
            (n, i, parts) =>
              n > Number(this.state.currentVersion.split('.')[i]) &&
              parts
                .slice(0, i)
                .every((p, j) => p === Number(this.state.currentVersion.split('.')[j])),
          );
      this.set({
        status: newer ? 'available' : 'current',
        version: newer ? candidate : undefined,
      });
    } catch {
      this.set({ status: 'error', message: '检查更新失败，请检查网络后重试。' });
    } finally {
      this.active = false;
    }
    return this.getState();
  }
  /** 下载失败保留旧程序，重试前重新检查发布元数据。 */
  async download() {
    if (this.active || this.state.status !== 'available') return this.getState();
    this.active = true;
    this.set({ status: 'downloading', percent: 0, message: undefined });
    try {
      await this.updater.downloadUpdate();
      this.set({ status: 'downloaded', percent: 100 });
    } catch {
      this.set({
        status: 'error',
        message: '下载或校验失败，当前版本仍可使用。请重新检查更新。',
        percent: undefined,
      });
    } finally {
      this.active = false;
    }
    return this.getState();
  }
  /** 安装准备期间锁住请求；Main 拒绝准备时保持已下载状态。 */
  async install(confirm: () => Promise<boolean>, quit: () => void) {
    if (this.active || this.state.status !== 'downloaded') return this.getState();
    this.active = true;
    try {
      if (await confirm()) {
        this.set({ status: 'installing' });
        quit();
      }
    } catch {
      this.set({ status: 'downloaded', message: '启动安装失败，请重试。' });
    } finally {
      this.active = false;
    }
    return this.getState();
  }
}
