/** @fileoverview 备忘录的紧凑格式工具栏与内联链接输入，保留编辑选区并沿用已有无障碍菜单。 */
'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  CaseSensitive,
  Highlighter,
  Link,
  List,
  ListOrdered,
  ListTodo,
} from 'lucide-react';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { safeMemoLink } from './memo-document';

/** 格式按钮只订阅选区状态；链接表单始终内联，避免遮挡正在编辑的笔记。 */
export function MemoToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      ordered: current.isActive('orderedList'),
      bullet: current.isActive('bulletList'),
      task: current.isActive('taskList'),
      highlight: current.isActive('highlight'),
      link: current.isActive('link'),
      heading: current.getAttributes('heading').level ?? 0,
    }),
  });
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [headingsOpen, setHeadingsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [linkError, setLinkError] = useState('');

  /** 先验证协议再修改当前选区；失败留在表单中，不清掉原有链接。 */
  function setLink(event: FormEvent) {
    event.preventDefault();
    const url = safeMemoLink(href.trim());
    if (!url) {
      setLinkError('请输入完整的 https://、http:// 或 mailto: 地址。');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkOpen(false);
  }

  return (
    <>
      <div className="memo-toolbar" role="group" aria-label="备忘录格式">
        <button
          ref={anchor}
          type="button"
          title="段落样式"
          aria-label="段落样式"
          aria-haspopup="menu"
          aria-expanded={headingsOpen}
          aria-controls={headingsOpen ? id : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setHeadingsOpen(!headingsOpen)}
        >
          <CaseSensitive size={19} />
        </button>
        <button
          type="button"
          title="加粗 (Ctrl+B)"
          aria-label="加粗"
          aria-pressed={state.bold}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          title="编号列表"
          aria-label="编号列表"
          aria-pressed={state.ordered}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={18} />
        </button>
        <button
          type="button"
          title="项目符号列表"
          aria-label="项目符号列表"
          aria-pressed={state.bullet}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          title="勾选列表"
          aria-label="勾选列表"
          aria-pressed={state.task}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListTodo size={18} />
        </button>
        <button
          type="button"
          title="重点标记"
          aria-label="重点标记"
          aria-pressed={state.highlight}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter size={17} />
        </button>
        <button
          type="button"
          title="插入链接"
          aria-label="插入链接"
          aria-expanded={linkOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setHref(editor.getAttributes('link').href ?? '');
            setLinkError('');
            setLinkOpen(!linkOpen);
          }}
        >
          <Link size={17} />
        </button>
      </div>
      {headingsOpen && (
        <TaskActionsPopover
          id={id}
          anchor={anchor}
          label="段落样式"
          role="menu"
          onClose={() => setHeadingsOpen(false)}
        >
          {[0, 1, 2, 3].map((level) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={state.heading === level}
              key={level}
              onClick={() => {
                if (level === 0) editor.chain().focus().setParagraph().run();
                else
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: level as 1 | 2 | 3 })
                    .run();
                setHeadingsOpen(false);
              }}
            >
              {['正文', '一级标题', '二级标题', '三级标题'][level]}
            </button>
          ))}
        </TaskActionsPopover>
      )}
      {linkOpen && (
        <form className="memo-link-form" onSubmit={setLink}>
          <label htmlFor={`${id}-link`}>链接地址</label>
          <input
            id={`${id}-link`}
            type="url"
            value={href}
            placeholder="https://"
            autoFocus
            onChange={(event) => setHref(event.target.value)}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? `${id}-error` : undefined}
          />
          {linkError && (
            <p id={`${id}-error`} role="alert">
              {linkError}
            </p>
          )}
          <div>
            <button type="submit">设置链接</button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              移除链接
            </button>
            <button type="button" onClick={() => setLinkOpen(false)}>
              取消
            </button>
          </div>
        </form>
      )}
    </>
  );
}
