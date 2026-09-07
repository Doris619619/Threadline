/** @fileoverview 验证共享导航助手在刷新后的导航延迟出现时仍选择正确断点入口。 */

import { expect, test } from '@playwright/test';
import { openWorkspaceSection } from './support/workspace';

test('waits for navigation readiness before choosing the responsive entry', async ({
  page,
}) => {
  test.setTimeout(5_000);
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      .loading nav { visibility: hidden; }
      .mobile { display: none; }
      @media (max-width: 600px) {
        .desktop { display: none; }
        .mobile { display: block; }
      }
    </style>
    <body class="loading">
      <nav class="desktop" aria-label="主导航">
        <button onclick="document.querySelector('output').textContent = 'desktop'">设置</button>
      </nav>
      <nav class="mobile" aria-label="移动端主导航">
        <button onclick="document.querySelector('#settings').hidden = false">更多</button>
        <button id="settings" hidden onclick="document.querySelector('output').textContent = 'mobile'">设置</button>
      </nav>
      <output></output>
    </body>
  `);
  // 模拟刷新后导航尚未挂载的窗口，延迟只用于测试夹具，不改变产品行为。
  await page.evaluate(() => {
    window.setTimeout(() => document.body.classList.remove('loading'), 300);
  });
  await openWorkspaceSection(page, '设置');
  const expectedLayout = page.viewportSize()!.width <= 600 ? 'mobile' : 'desktop';
  await expect(page.locator('output')).toHaveText(expectedLayout);
});
