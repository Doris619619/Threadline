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

test('微信成果、对方验收、昵称与本地时区', async ({ page }) => {
  await page.goto('/together-preview');
  await expect(
    page.getByRole('heading', { name: '我们的小窝', exact: true }),
  ).toBeVisible();
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
});
test('四主题深浅色与手机布局，无横向溢出', async ({ page }) => {
  await page.goto('/together-preview');
  await expect(
    page.getByRole('heading', { name: '我们的小窝', exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByRole('heading', { name: '我们的小窝', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '空间设置', exact: true }).click();
  await page.getByText('解除绑定', { exact: true }).click();
  await page.getByRole('button', { name: '确认解除绑定', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '两人空间', exact: true }),
  ).toBeVisible();
});

test('长称呼、键盘退出、减少动态效果与错误输入修正', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/together-preview');
  await expect(
    page.getByRole('heading', { name: '我们的小窝', exact: true }),
  ).toBeVisible();
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
