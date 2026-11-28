/** @fileoverview 管理单个日期的备忘录会话：即时草稿、串行自动保存、恢复与显式版本冲突处理。 */
import {
  EMPTY_MEMO,
  parseMemoDocument,
  sameMemo,
  type MemoDocument,
  type MemoRecord,
} from './memo-document';
import { MemoConflictError, type MemoRepository } from './memo-repository';
import { MemoDrafts } from './memo-drafts';

export type MemoState = {
  content: MemoDocument;
  ready: boolean;
  dirty: boolean;
  saving: boolean;
  error?: string;
  storageError?: string;
  conflict?: MemoRecord;
};

export class MemoSession {
  private state: MemoState = {
    content: EMPTY_MEMO,
    ready: false,
    dirty: false,
    saving: false,
  };
  private readonly listeners = new Set<() => void>();
  private revision: number | null = null;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private operation?: Promise<void>;
  private started = false;

  /** 仓储和日志固定到账号/日期；组件卸载后尚未完成的保存仍使用原作用域。 */
  constructor(
    private readonly repository: MemoRepository,
    private readonly drafts: MemoDrafts,
  ) {}

  /** React 外部 store 只在状态真正发布时得到新快照。 */
  getSnapshot = (): MemoState => this.state;

  /** 编辑器与状态提示共享一个订阅，不让每次按键重渲染整个工作台。 */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 合并新状态并通知当前页面；无订阅者时仍可安全完成旧日期的保存。 */
  private publish(patch: Partial<MemoState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /** 本机草稿写入失败必须可见；内存文档继续保留，并允许云端保存或复制内容。 */
  private persist() {
    try {
      this.drafts.write({
        content: this.state.content,
        revision: this.revision,
        changedAt: Date.now(),
      });
      this.publish({ storageError: undefined });
    } catch {
      this.publish({
        storageError: '本机草稿未能保存，请先复制内容，或等待同步成功后再离开。',
      });
    }
  }

  /** 读取日志只执行一次，Strict Mode 重连不会重放草稿或发起重复保存。 */
  start = () => {
    if (this.started) return;
    this.started = true;
    try {
      const { draft, cached, warning } = this.drafts.read();
      this.revision = draft ? draft.revision : (cached?.revision ?? null);
      this.publish({
        content: draft?.content ?? cached?.content ?? EMPTY_MEMO,
        dirty: Boolean(draft),
        ready: Boolean(draft || cached),
        storageError: warning,
      });
    } catch (error) {
      this.publish({
        storageError:
          error instanceof Error ? error.message : '本机草稿无法读取，原始内容已保留。',
      });
    }
    void this.refresh();
  };

  /** 立即保存编辑内容的本机日志，500ms 安静期后同步；冲突期间继续保留编辑但暂停覆盖。 */
  change = (content: MemoDocument) => {
    const parsed = parseMemoDocument(content);
    if (sameMemo(parsed, this.state.content)) return;
    this.generation++;
    this.publish({ content: parsed, dirty: true });
    this.persist();
    clearTimeout(this.timer);
    if (!this.state.conflict && !this.state.error)
      this.timer = setTimeout(() => void this.flush(), 500);
  };

  /** 云端读回同一内容也视为确认，处理服务器已提交但响应丢失后的重试。 */
  private confirm(saved: MemoRecord, generation: number) {
    this.revision = saved.revision;
    const dirty = this.generation !== generation;
    this.publish({ dirty, error: undefined, conflict: undefined });
    try {
      this.drafts.cache(saved);
      if (dirty) this.persist();
      else {
        this.drafts.clear();
        this.publish({ storageError: undefined });
      }
    } catch {
      this.publish({ storageError: '云端已保存，本机缓存更新失败。' });
    }
  }

  /** 串行提交最新输入；旧响应只确认它实际提交的版本，不清掉随后输入的日志。 */
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.operation)
      return this.operation.then(() =>
        this.state.dirty && !this.state.error && !this.state.conflict
          ? this.flush()
          : undefined,
      );
    if (!this.state.ready || !this.state.dirty || this.state.conflict)
      return Promise.resolve();
    if (this.revision === null) return this.refresh();
    this.operation = this.savePending().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  };

  /** 保存循环只在有新输入时继续，任何失败均停止自动重试并保留全部草稿。 */
  private async savePending() {
    this.publish({ saving: true });
    try {
      while (this.state.dirty && !this.state.conflict) {
        const generation = this.generation;
        const content = this.state.content;
        try {
          const saved = await this.repository.save(content, this.revision!);
          this.confirm(saved, generation);
        } catch (error) {
          if (error instanceof MemoConflictError) {
            const remote = await this.repository.read();
            if (sameMemo(remote.content, content)) {
              this.confirm(remote, generation);
              continue;
            }
            this.publish({ conflict: remote });
          }
          this.publish({
            error: error instanceof Error ? error.message : '同步失败，草稿已保留。',
          });
          break;
        }
      }
    } catch {
      this.publish({ error: '无法读取最新版本，草稿已保留，请重试。' });
    } finally {
      this.publish({ saving: false });
    }
  }

  /** 首次打开、重新联网和手动重试时读最新版本；读取失败绝不把已有内容当作空文档覆盖。 */
  refresh = (): Promise<void> => {
    if (this.operation) return this.operation;
    this.operation = this.loadRemote().finally(() => {
      this.operation = undefined;
    });
    return this.operation.then(() => {
      if (this.state.dirty && !this.state.error && !this.state.conflict)
        return this.flush();
    });
  };

  /** 比较当前草稿的基线版本；未知基线只有在远端为空时才允许自动新建。 */
  private async loadRemote() {
    this.publish({ saving: true });
    try {
      const remote = await this.repository.read();
      if (!this.state.dirty) {
        this.revision = remote.revision;
        this.publish({
          content: remote.content,
          error: undefined,
          conflict: undefined,
        });
        try {
          this.drafts.cache(remote);
        } catch {
          /* 云端真源已读到；首次编辑时再明确报告草稿写入失败。 */
        }
      } else if (sameMemo(this.state.content, remote.content)) {
        this.confirm(remote, this.generation);
      } else if (
        this.revision === remote.revision ||
        (this.revision === null && remote.revision === 0)
      ) {
        this.revision = remote.revision;
        this.publish({ error: undefined, conflict: undefined });
        this.persist();
      } else {
        this.publish({ conflict: remote, error: new MemoConflictError().message });
      }
    } catch (error) {
      this.publish({
        error: error instanceof Error ? error.message : '暂时无法同步，草稿已保留。',
      });
    } finally {
      this.publish({ ready: true, saving: false });
    }
  }

  /** 用户明确选择保留本机内容后，仍使用刚读到的云版本条件，后续并发更新不会被盲目覆盖。 */
  keepDraft = () => {
    if (!this.state.conflict) return;
    this.revision = this.state.conflict.revision;
    this.publish({ conflict: undefined, error: undefined });
    this.persist();
    void this.flush();
  };

  /** 只有用户明确采用云端版本才替换编辑器内容；同时清掉本会话及被恢复的旧草稿。 */
  acceptRemote = () => {
    if (!this.state.conflict) return;
    const remote = this.state.conflict;
    this.generation++;
    this.publish({ content: remote.content });
    this.confirm(remote, this.generation);
  };
}
