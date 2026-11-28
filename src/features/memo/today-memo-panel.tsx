/** @fileoverview 首页今日备忘录自由笔记面板：延迟加载的富文本编辑、按日恢复和账号同步提示。 */
'use client';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BookOpen, Ellipsis, Pencil } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { usesLocalWorkspace } from '@/lib/workspace-runtime';
import {
  createCloudMemoRepository,
  createLocalMemoRepository,
  type MemoRepository,
} from './memo-repository';
import { MemoDrafts } from './memo-drafts';
import { MemoSession } from './memo-session';
import { retainMemoSession } from './memo-session-registry';
import { createMemoExtensions } from './memo-extensions';
import { EMPTY_MEMO, parseMemoDocument, sameMemo } from './memo-document';
import { MemoToolbar } from './memo-toolbar';

/** 账号或日期改变时重建独立编辑会话，演示不会读取云账号的本机草稿。 */
export function TodayMemoPanel({ date }: { date: string }) {
  const cloud = useOptionalCloudRuntime();
  const local = usesLocalWorkspace();
  const owner = local ? 'local' : cloud?.user.id;
  const repository = useMemo(
    () =>
      local
        ? createLocalMemoRepository(date)
        : cloud
          ? createCloudMemoRepository(cloud.client, cloud.user.id, date)
          : null,
    [cloud, date, local],
  );
  if (!owner || !repository)
    return (
      <Surface className="memo-panel">
        <h2>今日备忘录</h2>
        <p role="alert">请登录后使用备忘录。</p>
      </Surface>
    );
  return (
    <MemoEditor
      key={`${owner}:${date}`}
      owner={owner}
      date={date}
      repository={repository}
      local={local}
    />
  );
}

/** 编辑器只处理当前日期；每次输入同步落草稿，失焦或离开时立即启动剩余提交。 */
function MemoEditor({
  owner,
  date,
  repository,
  local,
}: {
  owner: string;
  date: string;
  repository: MemoRepository;
  local: boolean;
}) {
  const [session] = useState(() =>
    retainMemoSession(
      owner,
      date,
      () =>
        new MemoSession(
          repository,
          new MemoDrafts(owner, date, () => window.localStorage),
        ),
    ),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [reading, setReading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [notice, setNotice] = useState('');
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const extensions = useMemo(() => createMemoExtensions(setEditorError), []);
  const editor = useEditor({
    extensions,
    content: EMPTY_MEMO,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    injectCSS: false,
    editorProps: {
      attributes: {
        class: 'memo-document',
        role: 'textbox',
        'aria-label': '今日备忘录内容',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
    },
    /** 解析失败只提示未保存，不伪造成功状态；原编辑内容仍可复制或撤销。 */
    onUpdate: ({ editor: current }) => {
      try {
        session.change(parseMemoDocument(current.getJSON()));
        setEditorError('');
      } catch (error) {
        setEditorError(
          error instanceof Error ? error.message : '内容未能保存，请先复制备份。',
        );
      }
    },
    onBlur: () => {
      void session.flush();
    },
  });

  useEffect(() => {
    session.start();
    void session.refresh();
    /** 回到页面或联网后读取最新版本，未确认的草稿由会话保留并比较版本。 */
    const refresh = () => {
      void session.refresh();
    };
    /** 后台前启动提交；本机日志已经在输入事件中同步写入，不依赖异步卸载。 */
    const visibility = () => {
      if (document.visibilityState === 'hidden') void session.flush();
      else refresh();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibility);
      void session.flush();
    };
  }, [session]);

  useEffect(() => {
    if (!editor || !state.ready) return;
    try {
      if (!sameMemo(editor.getJSON() as typeof EMPTY_MEMO, state.content))
        editor.commands.setContent(state.content, { emitUpdate: false });
    } catch {
      /* 过大的未保存输入保持在编辑器中，不能被旧快照静默覆盖。 */
    }
  }, [editor, state.content, state.ready]);

  useEffect(() => {
    editor?.setEditable(state.ready && !reading, false);
  }, [editor, reading, state.ready]);

  useEffect(() => {
    /** 只有无法落盘的输入才阻止关闭；正常的待同步草稿可在下次打开继续提交。 */
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (editorError || (state.dirty && state.storageError)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [editorError, state.dirty, state.storageError]);

  /** 复制当前编辑器内容，包含尚未提交的输入；权限失败不谎报成功。 */
  async function copyMarkdown() {
    if (!editor) return;
    try {
      await navigator.clipboard.writeText(editor.getMarkdown());
      setNotice('已复制 Markdown');
    } catch {
      setNotice('复制失败，请在正文中选中内容后复制。');
    }
    setMenuOpen(false);
  }

  const status = !state.ready
    ? '正在读取…'
    : state.saving
      ? '正在保存…'
      : state.error
        ? '待同步'
        : state.dirty
          ? '草稿已保留'
          : local
            ? '已保存到本机'
            : '已同步';
  return (
    <Surface className="memo-panel" aria-labelledby={`${id}-title`}>
      <header className="memo-header">
        <h2 id={`${id}-title`}>今日备忘录</h2>
        <div className="memo-header-actions">
          <button
            type="button"
            aria-label={reading ? '编辑备忘录' : '阅读备忘录'}
            title={reading ? '编辑备忘录' : '阅读备忘录'}
            disabled={!state.ready}
            onClick={() => setReading(!reading)}
          >
            {reading ? <Pencil size={17} /> : <BookOpen size={17} />}
          </button>
          <button
            ref={anchor}
            type="button"
            aria-label="备忘录更多操作"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? id : undefined}
            disabled={!state.ready}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Ellipsis size={19} />
          </button>
        </div>
      </header>
      {menuOpen && (
        <TaskActionsPopover
          id={id}
          anchor={anchor}
          role="menu"
          label="备忘录更多操作"
          onClose={() => setMenuOpen(false)}
        >
          <button type="button" role="menuitem" onClick={() => void copyMarkdown()}>
            复制 Markdown
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setMenuOpen(false);
              if (window.confirm('清空这一天的备忘录？离开此页前可按 Ctrl+Z 撤销。')) {
                setReading(false);
                editor?.chain().focus().clearContent().run();
              }
            }}
          >
            清空本日内容
          </button>
        </TaskActionsPopover>
      )}
      {editor && state.ready && !reading && <MemoToolbar editor={editor} />}
      {!state.ready && (
        <p className="memo-loading" role="status">
          正在读取备忘录…
        </p>
      )}
      <div
        className="memo-editor"
        hidden={!state.ready}
        data-reading={reading || undefined}
      >
        <EditorContent editor={editor} />
      </div>
      {(state.error || state.storageError || editorError) && (
        <div className="memo-feedback" role="alert">
          <p>{editorError || state.storageError || state.error}</p>
          {state.conflict ? (
            <div>
              <button type="button" onClick={session.keepDraft}>
                保留我的版本
              </button>
              <button type="button" onClick={session.acceptRemote}>
                采用云端版本
              </button>
            </div>
          ) : state.error ? (
            <button
              type="button"
              disabled={state.saving}
              onClick={() => void session.refresh()}
            >
              重试同步
            </button>
          ) : null}
        </div>
      )}
      <footer className="memo-footer">
        <span>{date}</span>
        <span role="status" aria-live="polite">
          {notice || (editorError ? '尚未保存' : status)}
        </span>
      </footer>
    </Surface>
  );
}
