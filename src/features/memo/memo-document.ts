/** @fileoverview 定义备忘录的结构化文档与快照，校验存储边界并限制可执行链接及异常大小。 */
import type { JSONContent } from '@tiptap/core';

export type MemoDocument = JSONContent & { type: 'doc'; content: JSONContent[] };
export type MemoRecord = { content: MemoDocument; revision: number };
export const EMPTY_MEMO: MemoDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
export const MEMO_MAX_LENGTH = 200_000;
const blocks = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
];
const inline = ['text', 'hardBreak'];
const marks = ['bold', 'italic', 'strike', 'underline', 'code', 'highlight', 'link'];

/** 链接只接受明确的网页与邮件协议；空值、相对地址和可执行协议不进入文档。 */
export function safeMemoLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) return url.href;
  } catch {
    /* 不完整地址由链接输入框提示，粘贴时仅去除链接属性。 */
  }
}

/** 拒绝损坏或过大的结构，丢弃外部样式；保留标题、嵌套列表、勾选和安全文本格式。 */
export function parseMemoDocument(value: unknown): MemoDocument {
  if (JSON.stringify(value)?.length > MEMO_MAX_LENGTH)
    throw new Error('备忘录太长，请分到其他日期保存。');
  let count = 0;
  /** 递归验证节点的父子关系；不把未知结构静默转换为空白文档。 */
  function node(raw: unknown, allowed: string[], depth: number): JSONContent {
    if (!raw || typeof raw !== 'object' || ++count > 10_000 || depth > 32)
      throw new Error('备忘录内容无法读取，原始草稿已保留。');
    const item = raw as JSONContent;
    if (!item.type || !allowed.includes(item.type))
      throw new Error('备忘录包含不支持的内容。');
    const result: JSONContent = { type: item.type };
    if (item.type === 'text') {
      if (typeof item.text !== 'string' || !item.text.length)
        throw new Error('备忘录文本损坏。');
      result.text = item.text;
      if (item.marks)
        result.marks = item.marks
          .filter((mark) => marks.includes(mark.type))
          .flatMap((mark) => {
            if (mark.type !== 'link') return [{ type: mark.type }];
            const href = safeMemoLink(mark.attrs?.href);
            return href
              ? [
                  {
                    type: 'link',
                    attrs: {
                      href,
                      target: '_blank',
                      rel: 'noopener noreferrer nofollow',
                    },
                  },
                ]
              : [];
          });
      return result;
    }
    if (item.type === 'heading')
      result.attrs = {
        level: [1, 2, 3].includes(item.attrs?.level) ? item.attrs!.level : 2,
      };
    if (item.type === 'orderedList')
      result.attrs = {
        start:
          Number.isInteger(item.attrs?.start) && item.attrs!.start > 0
            ? item.attrs!.start
            : 1,
      };
    if (item.type === 'taskItem')
      result.attrs = { checked: item.attrs?.checked === true };
    if (['hardBreak', 'horizontalRule'].includes(item.type)) return result;
    const children = item.content ?? [];
    if (!Array.isArray(children)) throw new Error('备忘录段落损坏。');
    const childTypes = ['paragraph', 'heading'].includes(item.type)
      ? inline
      : item.type === 'codeBlock'
        ? ['text']
        : item.type === 'taskList'
          ? ['taskItem']
          : ['bulletList', 'orderedList'].includes(item.type)
            ? ['listItem']
            : blocks;
    result.content = children.map((child) => node(child, childTypes, depth + 1));
    if (
      [
        'doc',
        'blockquote',
        'bulletList',
        'orderedList',
        'taskList',
        'listItem',
        'taskItem',
      ].includes(item.type) &&
      !children.length
    )
      throw new Error('备忘录段落结构不完整。');
    if (
      ['listItem', 'taskItem'].includes(item.type) &&
      children[0]?.type !== 'paragraph'
    )
      throw new Error('备忘录列表结构不完整。');
    return result;
  }
  return node(value, ['doc'], 0) as MemoDocument;
}

/** 规范化后比较内容，让响应丢失后的重试识别已经成功提交的同一份文档。 */
export function sameMemo(left: MemoDocument, right: MemoDocument): boolean {
  return (
    JSON.stringify(parseMemoDocument(left)) === JSON.stringify(parseMemoDocument(right))
  );
}
