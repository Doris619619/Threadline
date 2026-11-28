/** @fileoverview 通过真实首页验证备忘录菜单、HTML/Markdown 粘贴、格式编辑、撤销与按日恢复。 */
import { expect, test, type Page } from '@playwright/test';
import { bootstrapLocalAdapterWorkspace } from './support/workspace';

const markdown =
  '# 今晚待办\n\n预计 58 分钟，另加送礼物的时间\n\n## 回宿舍路上\n\n1. 🎒 出发前带上小书包。\n2. 取 3 个快递（10 分钟）：TXB 两个，上元 2 号蜂巢柜一个。\n3. **取完快递后，把生日礼物放到同学宿舍楼下。**\n\n## 回自己宿舍后｜48 分钟\n\n1. 洗头（20 分钟）\n2. 洗袜子（10 分钟）\n3. 整理床上的蒸汽眼罩（8 分钟）\n4. 收拾宿舍（10 分钟）';

/** 走真实菜单路径，不直接改 React 状态或编辑器内部数据。 */
async function choose(page: Page, label: string) {
  await page.getByRole('button', { name: /^右栏显示内容：/ }).click();
  await page.getByRole('menuitemradio', { name: label, exact: true }).click();
}

/** 浏览器原生 ClipboardEvent/DataTransfer 执行真实粘贴链，不授予系统剪贴板读取权限。 */
async function paste(page: Page, data: { text: string; html?: string }) {
  const editor = page.getByRole('textbox', { name: '今日备忘录内容' });
  await editor.click();
  await editor.evaluate((element, input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', input.text);
    if (input.html) clipboardData.setData('text/html', input.html);
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, data);
}

/** 同一套真实组件测试在桌面和 WebKit 手机上运行，每页隔离本地存储。 */
test.beforeEach(async ({ page }) => {
  await bootstrapLocalAdapterWorkspace(page, 'memo-fixture');
  await choose(page, '今日备忘录');
  await expect(page.getByRole('textbox', { name: '今日备忘录内容' })).toHaveAttribute(
    'contenteditable',
    'true',
  );
});

test('粘贴整段 Markdown，切换栏目、刷新和日期后保持独立内容', async ({ page }) => {
  await paste(page, { text: markdown });
  const editor = page.locator('.memo-document');
  await expect(editor.locator('h1')).toHaveText('今晚待办');
  await expect(editor.locator('ol')).toHaveCount(2);
  await expect(editor.locator('li')).toHaveCount(7);
  await expect(editor.locator('strong')).toContainText('取完快递后');
  await choose(page, '任务列表');
  await expect(page.locator('.memo-document')).toHaveCount(0);
  await choose(page, '今日时间分布');
  await expect(page.locator('#home-side-time')).toBeVisible();
  await choose(page, '今日备忘录');
  await expect(editor).toContainText('生日礼物');
  await page.reload();
  await expect(editor.locator('li')).toHaveCount(7);
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(editor).toHaveText('');
  await paste(page, { text: '明天独立的备忘录' });
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await expect(editor.locator('li')).toHaveCount(7);
  await expect(editor).not.toContainText('明天独立');
});

test('HTML 粘贴保留标题、列表和加粗，工具栏可改格式且撤销可用', async ({
  page,
  isMobile,
}) => {
  await paste(page, {
    text: '标题\n取快递',
    html: '<h2 style="color:red">今晚待办</h2><ol><li><strong>取快递</strong></li><li>送礼物</li></ol><p><a href="javascript:alert(1)">提醒</a></p>',
  });
  const editor = page.locator('.memo-document');
  await expect(editor.locator('h2')).toHaveText('今晚待办');
  await expect(editor.locator('ol li')).toHaveCount(2);
  await expect(editor.locator('a')).toHaveCount(0);
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText('');
  await editor.fill('送礼物');
  // iOS 使用原生文字选区模拟长按全选；Windows 的 Ctrl+A 不会在 iOS WebKit 中选择文字。
  if (isMobile)
    await editor.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  else await editor.press('ControlOrMeta+a');
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('送礼物');
  const highlight = page.getByRole('button', { name: '重点标记', exact: true });
  if (isMobile) await highlight.tap();
  else await highlight.click();
  await expect(editor.locator('mark')).toHaveText('送礼物');
  await page.getByRole('button', { name: '段落样式', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '一级标题' }).click();
  await expect(editor.locator('h1')).toHaveText('送礼物');
  await page.getByRole('button', { name: '阅读备忘录', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: '编辑备忘录', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
});

test('主题和窄屏保留完整内容及工具按钮，截图核对方案 A', async ({ page }, testInfo) => {
  await paste(page, { text: markdown });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'classic';
    document.documentElement.dataset.colorScheme = 'light';
    document.documentElement.dataset.font = 'source-han-serif';
  });
  await expect(page.locator('.memo-document li')).toHaveCount(7);
  const viewport = page.viewportSize()!;
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
  for (const button of await page.locator('.memo-toolbar button').all()) {
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    if (testInfo.project.name === 'memo-iphone') {
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.locator('.memo-header h2').click();
  await expect(page.locator('.memo-footer')).toHaveText('2026-08-23');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some(
          (key) =>
            key.includes('threadline.memo.local.v1:') &&
            JSON.parse(localStorage.getItem(key)!).revision > 0,
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `.impeccable/review/memo-${testInfo.project.name}-classic-light.png`,
    fullPage: true,
  });
  await page.locator('.memo-panel').screenshot({
    path: `.impeccable/review/memo-${testInfo.project.name}-detail.png`,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.colorScheme = 'dark';
    window.scrollTo(0, 0);
  });
  // 共享控件有 140ms 主题色过渡，截图等待该过渡结束，避免把中间色误判为低对比。
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `.impeccable/review/memo-${testInfo.project.name}-classic-dark.png`,
    fullPage: true,
  });
});

test('本机存储失败且无法同步时，栏目和日期导航仍保留内存草稿', async ({ page }) => {
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('threadline.memo.'))
        throw new DOMException('quota', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  const editor = page.getByRole('textbox', { name: '今日备忘录内容' });
  await editor.fill('没有落盘也不能丢失的礼物提醒');
  await expect(page.locator('.memo-feedback')).toContainText('未能保存');
  await choose(page, '任务列表');
  // 编辑器已卸载，窗口级保护仍必须覆盖留在内存中的未落盘草稿。
  const blocked = await page.evaluate(
    () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
  );
  expect(blocked).toBe(true);
  await choose(page, '今日备忘录');
  await expect(editor).toHaveText('没有落盘也不能丢失的礼物提醒');
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(editor).toHaveText('');
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await expect(editor).toHaveText('没有落盘也不能丢失的礼物提醒');
});
