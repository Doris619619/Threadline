/** @fileoverview 真实页面与本地 PostgreSQL RPC 验证微信成果闭环、时区、关系与四主题布局。 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
/** 预览控件默认收起，测试使用实际开关，不让调试面板遮挡产品内容。 */
async function choosePreview(page: Page, label: string, value?: string) {
  await page.locator('.together-preview-dock > summary').click();
  if (value !== undefined)
    await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
  else await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator('.together-preview-dock > summary').click();
}

/** 验证真实输入焦点不会侵入标签；覆盖自动聚焦、鼠标、键盘和系统高对比度。 */
test('创建表单的焦点留在字段内，不遮挡标签或改变布局', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/together-preview');
  for (const mode of ['light', 'dark']) {
    for (const width of [1366, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: '立个 flag', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '立个 flag', exact: true });
      const goal = editor.getByLabel('目标', { exact: true });
      const reward = editor.getByLabel('完成后的奖励（选填）');
      await expect(goal).toBeFocused();
      const unfocusedBounds = await reward.boundingBox();
      // 焦点不得向外扩张，必须仍有可见指示；同时记录用户实际看到的聚焦画面。
      for (const [field, name] of [
        [goal, 'goal'],
        [reward, 'reward'],
      ] as const) {
        await field.click();
        await expect(field).toBeFocused();
        const indicator = await field.evaluate((node) => {
          const style = getComputedStyle(node);
          return { outline: style.outlineStyle, shadow: style.boxShadow };
        });
        expect(indicator.outline).toBe('none');
        expect(indicator.shadow).toContain('inset');
        expect(indicator.shadow).not.toContain('rgba(0, 0, 0, 0)');
        if (mode === 'dark')
          await editor.screenshot({
            path: `docs/screenshots/together/editor-focus-${name}-${width === 1366 ? 'desktop' : 'mobile'}.png`,
          });
      }
      expect(await reward.boundingBox()).toEqual(unfocusedBounds);
      const label = await editor
        .locator('.together-editor-caption')
        .last()
        .boundingBox();
      expect(unfocusedBounds!.y - label!.y - label!.height).toBeGreaterThanOrEqual(6);
      // 用实际 Tab/Enter 走到折叠说明，再进入文本框，验证焦点不会丢失。
      await page.keyboard.press('Tab');
      await expect(editor.locator('summary')).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      const notes = editor.getByLabel('怎样算完成（选填）');
      await expect(notes).toBeFocused();
      await expect(notes).toHaveCSS('outline-offset', '-2px');
      expect(
        await editor.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await page.emulateMedia({ forcedColors: 'active' });
      await reward.click();
      await expect(reward).toHaveCSS('outline-style', 'solid');
      await expect(reward).toHaveCSS('outline-offset', '-2px');
      await page.emulateMedia({ forcedColors: 'none' });
      await page.keyboard.press('Escape');
    }
    if (mode === 'light') await choosePreview(page, '切换深浅色');
  }
});

test('微信成果、对方验收、昵称与本地时区', async ({ page }) => {
  await page.goto('/together-preview');
  await expect(page.getByRole('heading', { name: '同频', exact: true })).toBeVisible();
  await expect(page.locator('.together-clock')).toContainText('北京时间');
  await expect(
    page.getByRole('region', { name: '我的 flag', exact: true }),
  ).toContainText('背完雅思 Unit 3');
  await expect(
    page.getByRole('region', { name: '我的 flag', exact: true }),
  ).not.toContainText('读完那本书的第三章');
  await expect(
    page.getByRole('region', { name: '对方的 flag', exact: true }),
  ).toContainText('读完那本书的第三章');
  await page.getByRole('button', { name: '立个 flag', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '立个 flag' });
  const title = `浏览器验收 ${Date.now()}`;
  await editor.getByLabel('目标', { exact: true }).fill(title);
  await editor.getByLabel('截止时间').fill('2026-10-01T22:00');
  await editor.getByLabel('完成后的奖励').fill('一杯奶茶');
  await editor.getByRole('button', { name: '立下 flag' }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog').first()).toContainText('22:00');
  await page
    .getByRole('button', { name: '我做到啦，第一时间给你看。', exact: true })
    .click();
  const submit = page.getByRole('dialog', { name: '我做到啦，第一时间给你看。' });
  await submit.getByLabel('已通过微信发送成果').check();
  await submit.getByLabel('成果说明').fill('成果已发微信，请看看。');
  await submit.getByRole('button', { name: '确认发送，交给对方验收' }).click();
  await expect(submit).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await choosePreview(page, '查看身份', '1');
  await expect(page.locator('.together-clock')).toContainText('纽约');
  await expect(
    page.getByRole('region', { name: '对方的 flag', exact: true }),
  ).toContainText(title);
  await expect(
    page.getByRole('region', { name: '我的 flag', exact: true }),
  ).not.toContainText(title);
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('10:00');
  await page
    .getByRole('button', { name: '还差一点点，再给我看看嘛。', exact: true })
    .click();
  const supplement = page.getByRole('dialog', { name: '还差一点点，再给我看看嘛。' });
  await supplement.getByLabel('需要补充什么').fill('再补一张订正照片');
  await supplement.getByRole('button', { name: '还差一点点，再给我看看嘛。' }).click();
  await expect(supplement).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await choosePreview(page, '查看身份', '0');
  await page.getByRole('button', { name: title, exact: true }).click();
  await page
    .getByRole('button', { name: '我做到啦，第一时间给你看。', exact: true })
    .click();
  await page.getByLabel('已通过微信发送成果').check();
  await page.getByRole('button', { name: '确认发送，交给对方验收' }).click();
  await expect(
    page.getByRole('dialog', { name: '我做到啦，第一时间给你看。' }),
  ).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await choosePreview(page, '查看身份', '1');
  await page.getByRole('button', { name: title, exact: true }).click();
  await page
    .getByRole('button', { name: '我看见啦，真的很棒 ❤️', exact: true })
    .click();
  const approval = page.getByRole('dialog', { name: '我看见啦，真的很棒 ❤️' });
  await approval.getByLabel('留一句夸奖').fill('说到做到，真棒！');
  await approval.getByRole('button', { name: '我看见啦，真的很棒 ❤️' }).click();
  await expect(approval).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText(
    '你的认真和努力，我都有好好看见',
  );
  await page.getByRole('button', { name: '送个小惊喜', exact: true }).click();
  const surprise = page.getByRole('dialog', { name: '送个小惊喜' });
  await surprise.getByLabel('给对方的小惊喜').fill('照片已经发到微信啦。');
  await surprise.getByRole('button', { name: '送给对方' }).click();
  await expect(surprise).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('照片已经发到微信啦。');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await page.getByRole('button', { name: '我们的回忆', exact: true }).click();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  const memory = page.locator('.together-memory-entry').filter({
    has: page.getByRole('button', { name: title, exact: true }),
  });
  await expect(memory).toContainText('一杯奶茶');
  const completedAt = await memory.locator('time').getAttribute('datetime');
  const localDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date(completedAt!));
  await expect(
    page.getByRole('region', { name: localDay, exact: true }).filter({ has: memory }),
  ).toHaveCount(1);
  await memory.getByRole('button', { name: '拆惊喜', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('照片已经发到微信啦。');
});
test('四主题深浅色与手机布局，无横向溢出', async ({ page }) => {
  await page.goto('/together-preview');
  await expect(page.getByRole('heading', { name: '同频', exact: true })).toBeVisible();
  for (const theme of ['blue', 'anya', 'cottage', 'classic']) {
    await choosePreview(page, '主题', theme);
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (let mode = 0; mode < 2; mode++) {
        await choosePreview(page, '切换深浅色');
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
        await expect(
          page.getByRole('button', { name: '立个 flag', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: '我们的回忆', exact: true }).click();
        await expect(page.locator('.together-memory-entry').first()).toBeVisible();
        const entry = page.locator('.together-memory-entry').first();
        const clock = await entry.locator('.together-memory-time').boundingBox();
        const content = await entry.locator('.together-memory-content').boundingBox();
        expect(clock!.x + clock!.width).toBeLessThan(content!.x);
        await expect(page.locator('.together-memory-day h3').first()).toContainText(
          /\d{4}年\d{1,2}月\d{1,2}日/,
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        await page.getByRole('button', { name: '正在进行', exact: true }).click();
      }
    }
  }
  await choosePreview(page, '主题', 'blue');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({
    path: 'docs/screenshots/together/desktop.png',
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .include('.together-page')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/screenshots/together/mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '我们的回忆', exact: true }).click();
  await expect(page.locator('.together-memory-entry').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/together/memories-mobile.png' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: 'docs/screenshots/together/memories-desktop.png' });
  expect(
    (await new AxeBuilder({ page }).include('.together-page').analyze()).violations,
  ).toEqual([]);
});

test('成果抽屉保留样式，桌面靠右、手机全屏，验收弹窗居中', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/together-preview');
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const note = page.locator('.together-note').filter({
      has: page.getByRole('button', { name: '读完那本书的第三章', exact: true }),
    });
    await note.getByRole('button', { name: '看看成果' }).click();
    const drawer = page.getByRole('dialog', {
      name: '读完那本书的第三章',
      exact: true,
    });
    await expect(drawer).toHaveCSS('padding-top', width === 1366 ? '24px' : '20px');
    await expect(drawer.locator('header')).toHaveCSS('display', 'flex');
    const bounds = await drawer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(Math.max(0, width - 560), 0);
    expect(bounds!.width).toBeCloseTo(Math.min(width, 560), 0);
    expect(bounds!.height).toBeCloseTo(900, 0);
    const approve = drawer.getByRole('button', {
      name: '我看见啦，真的很棒 ❤️',
      exact: true,
    });
    await expect(approve).toBeVisible();
    expect((await approve.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
      true,
    );
    if (width !== 320)
      await page.screenshot({
        path: `docs/screenshots/together/detail-${width === 1366 ? 'desktop' : 'mobile'}.png`,
      });
    await approve.click();
    const confirmation = page.getByRole('dialog', {
      name: '我看见啦，真的很棒 ❤️',
      exact: true,
    });
    await expect(confirmation).toHaveCSS(
      'padding-top',
      width === 1366 ? '24px' : '20px',
    );
    const modal = await confirmation.boundingBox();
    expect(modal!.x + modal!.width / 2).toBeCloseTo(width / 2, 0);
    await page.keyboard.press('Escape');
    await expect(approve).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(note.getByRole('button', { name: '看看成果' })).toBeFocused();
    await page.getByRole('button', { name: '立个 flag', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '立个 flag', exact: true });
    await editor.getByText('补充说明', { exact: true }).click();
    await expect(editor.getByLabel('完成后的奖励（选填）')).toHaveJSProperty(
      'required',
      false,
    );
    await expect(editor.getByLabel('怎样算完成（选填）')).toHaveJSProperty(
      'required',
      false,
    );
    expect(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
      true,
    );
    if (width !== 320)
      await page.screenshot({
        path: `docs/screenshots/together/editor-${width === 1366 ? 'desktop' : 'mobile'}.png`,
      });
    await page.keyboard.press('Escape');
  }
  await choosePreview(page, '切换深浅色');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '立个 flag', exact: true }).click();
  await page.getByRole('dialog').getByText('补充说明', { exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/together/editor-mobile-dark.png' });
});

test('已有账号邀请、昵称恢复和关系确认', async ({ page }) => {
  await page.goto('/together-preview');
  await choosePreview(page, '查看身份', '2');
  await expect(
    page.getByRole('heading', { name: '两人空间', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('先告诉对方怎么称呼你')
      .or(page.getByRole('button', { name: '输入邀请码', exact: true })),
  ).toBeVisible();
  if (await page.getByLabel('先告诉对方怎么称呼你').isVisible()) {
    await page.getByLabel('先告诉对方怎么称呼你').fill('朋友小夏');
    await page.getByRole('button', { name: '保存称呼', exact: true }).click();
  }
  await expect(
    page
      .getByRole('button', { name: '生成邀请码' })
      .or(page.locator('.together-invite code')),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '生成邀请码' }).isVisible())
    await page.getByRole('button', { name: '生成邀请码' }).click();
  const code = await page.locator('.together-invite code').innerText();
  await choosePreview(page, '查看身份', '3');
  await expect(
    page
      .getByLabel('先告诉对方怎么称呼你')
      .or(page.getByRole('button', { name: '输入邀请码', exact: true })),
  ).toBeVisible();
  if (await page.getByLabel('先告诉对方怎么称呼你').isVisible()) {
    await page.getByLabel('先告诉对方怎么称呼你').fill('朋友小冬');
    await page.getByRole('button', { name: '保存称呼', exact: true }).click();
  }
  await page.getByRole('button', { name: '输入邀请码', exact: true }).click();
  await page.getByLabel('对方的邀请码').fill(code);
  await page.getByRole('button', { name: '查看邀请', exact: true }).click();
  await expect(page.locator('.together-invite')).toContainText('朋友小夏');
  await page.getByRole('button', { name: '接受邀请', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '我们的自习室', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.together-score')).toHaveCount(0);
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByLabel('给对方的昵称').fill('小太阳');
  await page.getByRole('button', { name: '保存称呼', exact: true }).click();
  await expect(page.locator('.together-byline')).toContainText('小太阳');
  await choosePreview(page, '查看身份', '2');
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByRole('button', { name: '恢复我的展示名', exact: true }).click();
  await expect(page.locator('.together-byline')).toContainText('朋友小夏');
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByLabel('关系类型').selectOption('couple');
  await page.getByRole('button', { name: '请对方确认关系', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '我们的自习室', exact: true }),
  ).toBeVisible();
  await choosePreview(page, '查看身份', '3');
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByRole('button', { name: '确认关系', exact: true }).click();
  await expect(page.getByRole('heading', { name: '同频', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByText('解除绑定', { exact: true }).click();
  await page
    .getByRole('button', { name: '解除并结束未完成的 flag', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '两人空间', exact: true }),
  ).toBeVisible();
});

test('长称呼、键盘退出、减少动态效果与错误输入修正', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/together-preview');
  await expect(page.getByRole('heading', { name: '同频', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByLabel('自己的展示名').fill('桃'.repeat(30));
  await page.getByLabel('给对方的昵称').fill('熊'.repeat(30));
  await page.getByRole('button', { name: '保存称呼', exact: true }).click();
  await expect(page.locator('.together-byline')).toContainText('桃'.repeat(30));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByLabel('自己的展示名').fill('bad@example.test');
  await page.getByRole('button', { name: '保存称呼', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '不能使用邮箱',
  );
  await page.getByLabel('自己的展示名').fill('小桃');
  await page.getByLabel('给对方的昵称').fill('小熊');
  await page.getByRole('button', { name: '保存称呼', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '立个 flag', exact: true }).click();
  await page.getByLabel('目标', { exact: true }).fill('目'.repeat(100));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '立个 flag', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: '背完雅思 Unit 3，完成一次默写', exact: true })
    .click();
  expect(
    await page
      .getByRole('dialog')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
});

test('在目标卡上直接加油，一次点击只送出一次', async ({ page }) => {
  await page.goto('/together-preview');
  await page.getByRole('button', { name: '立个 flag', exact: true }).click();
  const title = `卡片加油验收 ${Date.now()}`;
  await page.getByLabel('目标', { exact: true }).fill(title);
  await page.getByRole('button', { name: '立下 flag', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await choosePreview(page, '查看身份', '1');
  const note = page
    .locator('.together-note')
    .filter({ has: page.getByRole('button', { name: title, exact: true }) });
  await note.getByRole('button', { name: '抱抱你，再加个油', exact: true }).click();
  await expect(note.getByRole('status')).toContainText('好感度 +1');
  await expect(
    note.getByRole('button', { name: '已为 TA 加油', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await choosePreview(page, '查看身份', '0');
  await expect(note.getByLabel('对方在为你加油')).toBeVisible();
  await note.getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('button', { name: '结束这条 flag', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
});
