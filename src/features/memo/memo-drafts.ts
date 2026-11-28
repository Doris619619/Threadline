/** @fileoverview 保存按账号/日期隔离的备忘录缓存与独立草稿日志，晚到的响应不能清除新输入。 */
import { workspaceStorageKey } from '@/lib/workspace-runtime';
import { parseMemoDocument, type MemoDocument, type MemoRecord } from './memo-document';

export type MemoDraft = {
  content: MemoDocument;
  revision: number | null;
  changedAt: number;
};
type StoredDraft = { key: string; raw: string; draft: MemoDraft };

export class MemoDrafts {
  private readonly prefix: string;
  private readonly ownKey: string;
  private adopted?: StoredDraft;

  /** 每个编辑会话独立记录，避免多个窗口离线时互相覆盖未提交草稿。 */
  constructor(
    owner: string,
    date: string,
    private readonly storageSource: Storage | (() => Storage),
  ) {
    this.prefix = workspaceStorageKey(
      `threadline.memo.v1:${encodeURIComponent(owner)}:${date}`,
    );
    this.ownKey = `${this.prefix}:draft:${crypto.randomUUID()}`;
  }

  /** 延迟访问浏览器存储，让禁用 localStorage 的环境走可见错误，而不是渲染崩溃。 */
  private get storage(): Storage {
    return typeof this.storageSource === 'function'
      ? this.storageSource()
      : this.storageSource;
  }

  /** 恢复最新草稿；其它日志仍保留，确认提交时只清理恢复过且没有改变的那一条。 */
  read(): { draft?: MemoDraft; cached?: MemoRecord; warning?: string } {
    const candidates: StoredDraft[] = [];
    let warning: string | undefined;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)!;
      if (!key.startsWith(`${this.prefix}:draft:`)) continue;
      const raw = this.storage.getItem(key)!;
      try {
        const draft = JSON.parse(raw) as MemoDraft;
        draft.content = parseMemoDocument(draft.content);
        if (
          !Number.isFinite(draft.changedAt) ||
          (draft.revision !== null &&
            (!Number.isSafeInteger(draft.revision) || draft.revision < 0))
        )
          throw new Error('Invalid draft');
        candidates.push({ key, raw, draft });
      } catch {
        warning = '部分本机草稿无法读取，原始内容已保留。';
      }
    }
    this.adopted = candidates.sort((a, b) => b.draft.changedAt - a.draft.changedAt)[0];
    const cachedRaw = this.storage.getItem(`${this.prefix}:cache`);
    let cached: MemoRecord | undefined;
    try {
      if (cachedRaw) {
        cached = JSON.parse(cachedRaw) as MemoRecord;
        cached.content = parseMemoDocument(cached.content);
        if (!Number.isSafeInteger(cached.revision) || cached.revision < 0)
          throw new Error('Invalid cache');
      }
    } catch {
      cached = undefined;
      warning = '本机缓存无法读取，原始内容已保留。';
    }
    return { draft: this.adopted?.draft, cached, warning };
  }

  /** 同步写日志后才宣称草稿可恢复；配额或隐私模式错误交给界面显示。 */
  write(draft: MemoDraft) {
    this.storage.setItem(this.ownKey, JSON.stringify(draft));
    // 新日志落盘后才转移恢复日志，连续离线重开不会留下会在未来复活的旧草稿。
    if (this.adopted && this.storage.getItem(this.adopted.key) === this.adopted.raw)
      this.storage.removeItem(this.adopted.key);
    this.adopted = undefined;
  }

  /** 已确认快照只能向前更新；旧响应不能降低本机版本号。 */
  cache(value: MemoRecord) {
    const key = `${this.prefix}:cache`;
    const raw = this.storage.getItem(key);
    if (!raw || (JSON.parse(raw) as MemoRecord).revision <= value.revision)
      this.storage.setItem(key, JSON.stringify(value));
  }

  /** 只在本会话全部输入确认后清日志，已被另一窗口修改的恢复日志不能移除。 */
  clear() {
    this.storage.removeItem(this.ownKey);
    if (this.adopted && this.storage.getItem(this.adopted.key) === this.adopted.raw)
      this.storage.removeItem(this.adopted.key);
    this.adopted = undefined;
  }
}
