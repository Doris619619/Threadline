/** @fileoverview 验证备忘录保存时序、重启恢复、账号/日期隔离、离线草稿与多设备冲突。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoSession } from '@/features/memo/memo-session';
import { MemoDrafts } from '@/features/memo/memo-drafts';
import {
  EMPTY_MEMO,
  type MemoDocument,
  type MemoRecord,
} from '@/features/memo/memo-document';
import {
  MemoConflictError,
  type MemoRepository,
} from '@/features/memo/memo-repository';

/** 创建符合文档 schema 的短笔记，测试只关心保存语义而非节点拼装。 */
const doc = (text: string): MemoDocument => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
/** 模拟远端的真实版本条件，暴露当前记录以便模拟另一个设备写入。 */
function server() {
  let current: MemoRecord = { content: EMPTY_MEMO, revision: 0 };
  const repository: MemoRepository = {
    read: vi.fn(async () => current),
    save: vi.fn(async (content, revision) => {
      if (current.revision !== revision) throw new MemoConflictError();
      current = { content, revision: revision + 1 };
      return current;
    }),
  };
  return {
    repository,
    remote: (record: MemoRecord) => {
      current = record;
    },
    current: () => current,
  };
}
/** 新会话对应新打开的编辑页，草稿仍来自同一持久化存储。 */
function session(repository: MemoRepository, owner = 'alice', date = '2026-11-28') {
  return new MemoSession(repository, new MemoDrafts(owner, date, localStorage));
}
beforeEach(() => {
  localStorage.clear();
});

describe('备忘录保存会话', () => {
  it('连续离线恢复只转移当前日志，损坏的旧日志不阻断有效草稿恢复', () => {
    localStorage.setItem(
      'threadline.memo.v1:alice:2026-11-28:draft:broken',
      '{invalid',
    );
    const first = new MemoDrafts('alice', '2026-11-28', localStorage);
    first.write({ content: doc('草稿一'), revision: 0, changedAt: 1 });
    const second = new MemoDrafts('alice', '2026-11-28', localStorage);
    expect(second.read().draft?.content).toEqual(doc('草稿一'));
    second.write({ content: doc('草稿二'), revision: 0, changedAt: 2 });
    const third = new MemoDrafts('alice', '2026-11-28', localStorage);
    expect(third.read().draft?.content).toEqual(doc('草稿二'));
    third.write({ content: doc('草稿三'), revision: 0, changedAt: 3 });
    third.clear();
    expect(
      new MemoDrafts('alice', '2026-11-28', localStorage).read().draft,
    ).toBeUndefined();
    expect(
      localStorage.getItem('threadline.memo.v1:alice:2026-11-28:draft:broken'),
    ).toBe('{invalid');
  });
  it('按账号和日期隔离草稿，失败后新会话能恢复并重试', async () => {
    const backend = server();
    const failure = vi
      .spyOn(backend.repository, 'save')
      .mockRejectedValue(new Error('offline'));
    const first = session(backend.repository);
    first.start();
    await first.refresh();
    first.change(doc('尚未同步的礼物提醒'));
    await first.flush();
    expect(first.getSnapshot().dirty).toBe(true);
    expect(first.getSnapshot().error).toBe('offline');
    expect(
      new MemoDrafts('bob', '2026-11-28', localStorage).read().draft,
    ).toBeUndefined();
    expect(
      new MemoDrafts('alice', '2026-11-29', localStorage).read().draft,
    ).toBeUndefined();
    failure.mockRestore();
    const reopened = session(backend.repository);
    reopened.start();
    await reopened.refresh();
    await reopened.flush();
    expect(backend.current().content).toEqual(doc('尚未同步的礼物提醒'));
    expect(reopened.getSnapshot().dirty).toBe(false);
    expect(
      new MemoDrafts('alice', '2026-11-28', localStorage).read().draft,
    ).toBeUndefined();
  });

  it('保存响应晚到时保留后续输入，并按新版本继续保存', async () => {
    const backend = server();
    const active = session(backend.repository);
    active.start();
    await active.refresh();
    let resolve!: (value: MemoRecord) => void;
    vi.mocked(backend.repository.save).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    active.change(doc('先取快递'));
    const saving = active.flush();
    active.change(doc('先取快递，再送礼物'));
    backend.remote({ content: doc('先取快递'), revision: 1 });
    resolve(backend.current());
    await saving;
    expect(backend.current().content).toEqual(doc('先取快递，再送礼物'));
    expect(backend.current().revision).toBe(2);
    expect(active.getSnapshot().dirty).toBe(false);
  });

  it('远端冲突保留草稿，只有用户选择后才覆盖最新版本', async () => {
    const backend = server();
    const active = session(backend.repository);
    active.start();
    await active.refresh();
    active.change(doc('电脑写的内容'));
    backend.remote({ content: doc('手机写的内容'), revision: 1 });
    await active.flush();
    expect(active.getSnapshot().conflict?.content).toEqual(doc('手机写的内容'));
    expect(active.getSnapshot().content).toEqual(doc('电脑写的内容'));
    active.keepDraft();
    await active.flush();
    expect(backend.current()).toEqual({ content: doc('电脑写的内容'), revision: 2 });
  });

  it('请求已提交但响应丢失时，读回相同内容即确认，避免重复提交', async () => {
    const backend = server();
    const active = session(backend.repository);
    active.start();
    await active.refresh();
    active.change(doc('取快递'));
    vi.mocked(backend.repository.save).mockImplementationOnce(async (content) => {
      backend.remote({ content, revision: 1 });
      throw new Error('response lost');
    });
    await active.flush();
    await active.refresh();
    expect(active.getSnapshot().dirty).toBe(false);
    expect(backend.current().revision).toBe(1);
  });

  it('首次读取失败时只保留未知基线草稿，不把已有云内容当作空页覆盖', async () => {
    const backend = server();
    const read = vi
      .spyOn(backend.repository, 'read')
      .mockRejectedValue(new Error('offline'));
    const active = session(backend.repository);
    active.start();
    await active.refresh();
    active.change(doc('离线输入'));
    await active.flush();
    expect(backend.repository.save).not.toHaveBeenCalled();
    backend.remote({ content: doc('既有云内容'), revision: 2 });
    read.mockRestore();
    await active.refresh();
    expect(active.getSnapshot().conflict?.revision).toBe(2);
    active.acceptRemote();
    expect(active.getSnapshot().content).toEqual(doc('既有云内容'));
    expect(active.getSnapshot().dirty).toBe(false);
  });

  it('存储配额失败可见且保留编辑内容，不把未落盘草稿报告为成功', async () => {
    const backend = server();
    vi.spyOn(backend.repository, 'save').mockRejectedValue(new Error('offline'));
    const storage = {
      getItem: () => null,
      key: () => null,
      length: 0,
      clear: () => undefined,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('quota');
      },
    } as Storage;
    const active = new MemoSession(
      backend.repository,
      new MemoDrafts('alice', '2026-11-28', storage),
    );
    active.start();
    await active.refresh();
    active.change(doc('不要丢失'));
    await active.flush();
    expect(active.getSnapshot().storageError).toContain('未能保存');
    expect(active.getSnapshot().content).toEqual(doc('不要丢失'));
  });
});
