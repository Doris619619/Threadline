/** @fileoverview 首次引导四主题与窄屏验收，覆盖性别切换、持久化、首页标题和日程自动估时。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openWorkspaceSection, openSeededTaskEditor } from './support/workspace';

test('first-run choices persist, hide rhythm and fill schedule estimates', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('onboarding-seeded')) return;
    sessionStorage.setItem('onboarding-seeded', 'true');
    localStorage.clear();
    localStorage.setItem(
      'threadline.profile.preview.v1',
      JSON.stringify({
        owner_id: 'preview',
        gender: null,
        preferences_version: 0,
        onboarding_completed_at: null,
      }),
    );
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '选择喜欢的主题' })).toBeVisible();
  for (const [theme, label] of [
    ['blue', '默认蓝色'],
    ['anya', '安妮雅'],
    ['cottage', '皮卡小屋'],
    ['classic', '皮卡经典'],
  ]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveAttribute(
        'data-color-scheme',
        colorScheme,
      );
      const violations = (
        await new AxeBuilder({ page }).include('.onboarding-card').analyze()
      ).violations.filter((issue) =>
        ['critical', 'serious'].includes(issue.impact ?? ''),
      );
      expect(violations, theme).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`onboarding-${theme}-${colorScheme}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入工作台' })).toBeDisabled();
  await page.getByLabel('男生', { exact: true }).check();
  await page.screenshot({
    path: info.outputPath('onboarding-gender.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '进入工作台' }).click();
  await expect(
    page.getByRole('heading', { name: '任务大厅', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.tl-header')).not.toContainText('安排、执行、记录今天');
  await expect(page.getByRole('button', { name: '节律', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '任务大厅', exact: true }),
  ).toBeVisible();
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '个人资料' }).click();
  await page.getByLabel('女生', { exact: true }).check();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('性别已保存');
  await openWorkspaceSection(page, '节律');
  await expect(page.getByRole('heading', { name: '节律', exact: true })).toBeVisible();
  await openWorkspaceSection(page, '首页');
  await openSeededTaskEditor(page);
  const dialog = page.getByRole('dialog', { name: '编辑任务' });
  await dialog.getByLabel('开始时间', { exact: true }).fill('09:15');
  await dialog.getByLabel('结束时间', { exact: true }).fill('10:45');
  await expect(dialog.getByLabel('预计时长（分钟）')).toHaveValue('90');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await openSeededTaskEditor(page);
  await expect(page.getByLabel('预计时长（分钟）')).toHaveValue('90');
});
