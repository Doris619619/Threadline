/** @fileoverview 覆盖少量日程的浮层裁切、悬停跳动、长项目名、新增帧与装扮关闭。 */
import { expect, test } from '@playwright/test';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test('menus and project picker escape a one-row list without changing its width', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'interaction-menus');
  await page.clock.resume();
  // 仅保留一条演示日程，复现用户截图中菜单高于列表的条件。
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('threadline.tasks.v1')!);
    localStorage.setItem(
      'threadline.tasks.v1',
      JSON.stringify(rows.filter((t: { title: string }) => t.title === '邮件处理')),
    );
    const projects = JSON.parse(localStorage.getItem('threadline.projects.v1')!);
    projects[0].name = 'Ai音乐Video长期研究项目';
    localStorage.setItem('threadline.projects.v1', JSON.stringify(projects));
    localStorage.setItem(
      'threadline.appearance.v1',
      JSON.stringify({ theme: 'blue', font: 'source-han-serif' }),
    );
  });
  await page.reload();
  const row = page.locator('.timeline-row');
  await expect(row).toHaveCount(1);
  const before = await row.boundingBox();
  await row.getByRole('button', { name: '邮件处理更多操作' }).hover();
  await expect(page.getByRole('button', { name: '详细编辑', exact: true })).toHaveCount(
    0,
  );
  await row.getByRole('button', { name: '邮件处理更多操作' }).click();
  const menu = page.getByRole('group', { name: '邮件处理操作' });
  await expect(menu).toBeVisible();
  const button = menu.getByRole('button', { name: '删除', exact: true });
  expect(
    await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
  ).toBe(true);
  expect((await row.boundingBox())!.width).toBeCloseTo(before!.width, 0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await row.getByRole('button', { name: '邮件处理更多操作' }).click();
  await expect(menu).toBeVisible();
  await page.getByRole('heading', { name: '我的工作台' }).click();
  await expect(menu).toHaveCount(0);
  const project = row.getByRole('button', { name: /所属项目/ });
  const projectBox = await project.boundingBox();
  const titleBox = await row.locator('.task-title').boundingBox();
  expect(projectBox!.x + projectBox!.width).toBeLessThanOrEqual(titleBox!.x + 1);
  await project.click();
  await page
    .getByRole('group', { name: '邮件处理选择项目' })
    .getByRole('button', { name: '【课程】', exact: true })
    .click();
  await expect(project).toHaveAccessibleName('邮件处理所属项目：课程');
  await page.reload();
  await expect(
    page.getByRole('button', { name: '邮件处理所属项目：课程' }),
  ).toBeVisible();
});

test('creating a task closes the draft without rendering an empty replacement', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'interaction-create');
  await page.clock.resume();
  await page
    .locator('.schedule-panel')
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await page.getByPlaceholder('任务名称（按 Enter 保存）').fill('逐帧新增验收');
  await page.evaluate(() => {
    const sample = () => {
      const input = document.querySelector<HTMLInputElement>(
        '.timed-task-create-row input[placeholder="任务名称（按 Enter 保存）"]',
      );
      if (input?.value === '') document.body.dataset.emptyCreateFrame = 'true';
      if (input) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByTitle('保存任务', { exact: true }).click();
  await expect(page.getByPlaceholder('任务名称（按 Enter 保存）')).toHaveCount(0);
  await expect(
    page.locator('.timeline-row').filter({ hasText: '逐帧新增验收' }),
  ).toHaveCount(1);
  expect(await page.locator('body').getAttribute('data-empty-create-frame')).toBeNull();
});

test('wardrobe closes repeatedly after changing outfits and scrolling', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'interaction-wardrobe');
  await page.clock.resume();
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  for (const theme of ['皮卡小屋', '皮卡经典']) {
    await page.getByRole('button', { name: new RegExp(theme) }).click();
    for (let i = 0; i < 2; i++) {
      const trigger = page
        .getByRole('button', { name: '我的装扮', exact: true })
        .filter({ visible: true });
      if (!(await trigger.count()))
        await page.getByRole('button', { name: '更多', exact: true }).click();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: '我的装扮' });
      await dialog.getByRole('button', { name: '粉色外套' }).click();
      await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
      const close = dialog.getByRole('button', { name: '关闭装扮' });
      expect(
        await close.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
      ).toBe(true);
      await close.click();
      await expect(dialog).toHaveCount(0);
    }
  }
});
