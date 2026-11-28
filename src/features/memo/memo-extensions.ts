/** @fileoverview 复用 Tiptap 开源文档扩展，处理安全 HTML 与 Markdown 粘贴，不保留外部字体或可执行内容。 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { MEMO_MAX_LENGTH, parseMemoDocument, safeMemoLink } from './memo-document';

/** 先移除活动元素和事件属性，再由编辑器 schema 提取支持的文档结构。 */
export function cleanMemoHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document
    .querySelectorAll(
      'script,style,iframe,object,embed,link,meta,form,svg,math,img,video,audio',
    )
    .forEach((node) => node.remove());
  document.body.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      if (!['href', 'start', 'data-type', 'data-checked'].includes(attr.name))
        node.removeAttribute(attr.name);
    }
    if (node.hasAttribute('href')) {
      const href = safeMemoLink(node.getAttribute('href'));
      if (href) node.setAttribute('href', href);
      else node.removeAttribute('href');
    }
  });
  return document.body.innerHTML;
}

/** 相同扩展同时用于运行时和解析测试；格式继承 Threadline 主题，不注入 Tiptap 默认 CSS。 */
export function createMemoExtensions(
  onPasteError: (message: string) => void = () => undefined,
) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        defaultProtocol: 'https',
        isAllowedUri: (url) => Boolean(safeMemoLink(url)),
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }),
    Highlight,
    Placeholder.configure({ placeholder: '写点什么，或直接粘贴带标题和列表的内容…' }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    Extension.create({
      name: 'memoPaste',
      /** 原生 HTML 粘贴交给 schema；纯文本 Markdown 在当前位置转换，不替换整页。 */
      addProseMirrorPlugins() {
        const editor = this.editor;
        return [
          new Plugin({
            /** 事务落地前检查上限，拒绝无法保存的编辑，不让旧快照替换掉已显示的新输入。 */
            filterTransaction: (transaction) => {
              if (!transaction.docChanged) return true;
              try {
                parseMemoDocument(transaction.doc.toJSON());
                return true;
              } catch (error) {
                queueMicrotask(() =>
                  onPasteError(
                    error instanceof Error
                      ? error.message
                      : '这次编辑未能插入，请缩短内容后重试。',
                  ),
                );
                return false;
              }
            },
            props: {
              transformPastedHTML: cleanMemoHtml,
              /** 保留代码块的字面文本，普通纯文本无需进入 Markdown 解析。 */
              handlePaste: (_view, event) => {
                const html = event.clipboardData?.getData('text/html') ?? '';
                const text = event.clipboardData?.getData('text/plain') ?? '';
                if (
                  Math.max(html.length, text.length) +
                    JSON.stringify(editor.getJSON()).length >
                  MEMO_MAX_LENGTH
                ) {
                  onPasteError('这段内容太长，请分段粘贴。');
                  return true;
                }
                if (
                  html ||
                  editor.isActive('codeBlock') ||
                  !/(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)|\*\*[^*]+\*\*|\[[^\]]+\]\(/.test(
                    text,
                  )
                )
                  return false;
                try {
                  const content = parseMemoDocument(editor.markdown!.parse(text));
                  return editor.commands.insertContent(content);
                } catch {
                  onPasteError('这段内容的格式无法解析，可尝试粘贴纯文本。');
                  return true;
                }
              },
            },
          }),
        ];
      },
    }),
  ];
}
