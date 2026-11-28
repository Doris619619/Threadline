/** @fileoverview 在当前窗口保留未确认的备忘录会话，存储不可用时内部导航也不会丢失输入。 */
'use client';
import { workspaceStorageKey } from '@/lib/workspace-runtime';
import type { MemoSession } from './memo-session';

const sessions = new Map<string, MemoSession>();
let unloadGuardInstalled = false;

/** 保护所有尚未落盘的会话，包括已切到其他栏目或日期的草稿；保存成功后自然不再拦截。 */
function preventUnsavedMemoLoss(event: BeforeUnloadEvent) {
  for (const session of sessions.values()) {
    const state = session.getSnapshot();
    if (state.dirty && state.storageError) {
      event.preventDefault();
      event.returnValue = '';
      return;
    }
  }
}

/** 按账号和日期复用内存会话；仅淘汰已有持久副本的空闲会话，未保存内容一直留到窗口关闭。 */
export function retainMemoSession(
  owner: string,
  date: string,
  create: () => MemoSession,
): MemoSession {
  if (!unloadGuardInstalled && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', preventUnsavedMemoLoss);
    unloadGuardInstalled = true;
  }
  const key = workspaceStorageKey(`${owner}:${date}`);
  const session = sessions.get(key) ?? create();
  sessions.delete(key);
  sessions.set(key, session);
  for (const [oldKey, oldSession] of sessions) {
    if (sessions.size <= 16) break;
    const state = oldSession.getSnapshot();
    if (oldKey !== key && state.ready && !state.dirty && !state.saving)
      sessions.delete(oldKey);
  }
  return session;
}
