/** @fileoverview 验证真实 Tiptap 解析和编辑行为，覆盖用户示例、富文本安全、嵌套列表与撤销。 */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cleanMemoHtml, createMemoExtensions } from '@/features/memo/memo-extensions';
import { parseMemoDocument, safeMemoLink } from '@/features/memo/memo-document';

const editors: Editor[] = [];
/** 每例运行真实文档 schema，测试结束释放事件监听和视图。 */
function editor() {
  const instance = new Editor({
    element: document.createElement('div'),
    extensions: createMemoExtensions(),
    content: '',
  });
  editors.push(instance);
  return instance;
}
afterEach(() => editors.splice(0).forEach((instance) => instance.destroy()));

export const eveningMemo = `**今晚待办｜预计 58 分钟，另加送礼物的时间**

**回宿舍路上**

1. 🎒 出发前带上小书包。
2. 取 3 个快递（10 分钟）：TXB 两个，上元 2 号蜂巢柜一个。
3. **取完快递后，把生日礼物放到同学宿舍楼下。**

**回自己宿舍后｜48 分钟**

1. 洗头（20 分钟）
2. 洗袜子（10 分钟）
3. 整理床上的蒸汽眼罩（8 分钟）
4. 收拾宿舍（10 分钟）`;

describe('今日备忘录内容', () => {
  it('将用户的整段 Markdown 插入为两个编号列表，保留加粗与所有文字，并可一次撤销粘贴', () => {
    const instance = editor();
    const clipboardData = {
      getData: (type: string) => (type === 'text/plain' ? eveningMemo : ''),
    };
    instance.view.someProp('handlePaste', (handler) =>
      handler(
        instance.view,
        { clipboardData } as unknown as ClipboardEvent,
        instance.state.doc.slice(0),
      ),
    );
    expect(instance.view.dom.querySelectorAll('ol')).toHaveLength(2);
    expect(instance.view.dom.querySelectorAll('li')).toHaveLength(7);
    expect(instance.getText()).toContain('上元 2 号蜂巢柜一个');
    expect(instance.getText()).toContain('另加送礼物的时间');
    expect(instance.view.dom.querySelectorAll('strong').length).toBeGreaterThanOrEqual(
      4,
    );
    expect(() => parseMemoDocument(instance.getJSON())).not.toThrow();
    instance.commands.undo();
    expect(instance.isEmpty).toBe(true);
    instance.commands.redo();
    expect(instance.view.dom.querySelectorAll('li')).toHaveLength(7);
  });

  it('保留 HTML 标题和嵌套列表，但不保留脚本、远程图片、事件、字体和危险链接', () => {
    const instance = editor();
    const html = cleanMemoHtml(
      '<h1 style="font-size:100px" onclick="alert(1)">今晚待办</h1><ol start="3"><li><p>取快递</p><ul><li>TXB 两个</li></ul></li></ol><p><a href="javascript:alert(1)">危险</a><a href="https://example.com">安全</a></p><script>alert(1)</script><img src="https://example.com/a.png"><iframe src="https://example.com"></iframe>',
    );
    instance.commands.setContent(html);
    expect(instance.view.dom.querySelector('h1')?.textContent).toBe('今晚待办');
    expect(instance.view.dom.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(instance.view.dom.querySelector('ol ul li')?.textContent).toBe('TXB 两个');
    expect(instance.getHTML()).not.toMatch(
      /javascript:|onclick|font-size|<script|<img|<iframe/,
    );
    expect(instance.view.dom.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/',
    );
  });

  it('支持 Markdown 标题、勾选列表和刷新后的结构恢复', () => {
    const instance = editor();
    instance.commands.setContent(
      '# 今晚待办\n\n- [ ] 取快递\n- [x] 带上小书包\n\n## 回宿舍后\n\n洗头',
      { contentType: 'markdown' },
    );
    const saved = parseMemoDocument(instance.getJSON());
    const restored = editor();
    restored.commands.setContent(saved);
    expect(restored.view.dom.querySelector('h1')?.textContent).toBe('今晚待办');
    expect(restored.view.dom.querySelectorAll('li[data-type="taskItem"]')).toHaveLength(
      2,
    );
    expect(restored.view.dom.querySelectorAll('input:checked')).toHaveLength(1);
    expect(restored.getMarkdown()).toContain('- [x] 带上小书包');
  });

  it('拒绝损坏的持久化文档和可执行/伪装协议', () => {
    expect(() =>
      parseMemoDocument({ type: 'doc', content: [{ type: 'script' }] }),
    ).toThrow();
    expect(() => parseMemoDocument({ type: 'doc', content: [] })).toThrow();
    expect(safeMemoLink(' java\nscript:alert(1)')).toBeUndefined();
    expect(safeMemoLink('data:text/html,<script>')).toBeUndefined();
    expect(safeMemoLink('mailto:hello@example.com')).toBe('mailto:hello@example.com');
  });
});
