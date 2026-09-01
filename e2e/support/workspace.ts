/**
 * @fileoverview 提供 local adapter Web E2E 共享的隔离初始化、导航和种子任务编辑入口。
 */

import { expect, type Page } from '@playwright/test';

/** 固定本地时钟，使日期、seed 与页面文案在所有布局项目中可重复。 */
const frozenLocalNow = '2026-08-23T12:00:00+08:00';

/** 每个 local adapter 用例首次导航前必须移除的业务与窗口状态 key。 */
const localStorageKeys = [
  'threadline.tasks.v1',
  'threadline.projects.v1',
  'threadline.daily-by-date.v1',
  'threadline.daily-history.v1',
  'threadline.daily-templates.v1',
  'threadline.history.v1',
  'threadline.close-records.v1',
  'threadline.annotations.v1',
  'threadline.annotations.v2',
  'threadline.annotation-highlight-color.v1',
  'threadline.workstation.v1',
  'threadline.workspace.v1',
  'threadline.rhythm.v1',
  'threadline.desktop-mode.v2',
  'threadline.desktop-mode-before-floating.v2',
  'threadline.desktop-mode.v3',
  'threadline.desktop-window-states.v3',
  'threadline.desktop-last-compact-mode.v3',
  'threadline.desktop-compact-presentation.v3',
] as const;

/**
 * 以固定时间和空持久化状态打开 local adapter 首页。
 *
 * sessionStorage guard 让 reload 继续读取当前用例写入的数据，而不会二次清空它。
 */
export async function bootstrapLocalAdapterWorkspace(page: Page, seedKey: string) {
  await page.clock.install({ time: new Date(frozenLocalNow) });
  await page.addInitScript(
    ({ cleanupKey, keys }: { cleanupKey: string; keys: readonly string[] }) => {
      if (window.sessionStorage.getItem(cleanupKey)) return;
      window.sessionStorage.setItem(cleanupKey, 'true');
      for (const key of keys) window.localStorage.removeItem(key);
    },
    { cleanupKey: seedKey, keys: localStorageKeys },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(100);
}

/**
 * 在当前断点选择可见的桌面侧栏或移动底栏入口，并展开移动端“更多”菜单后再访问次级页。
 */
export async function openWorkspaceSection(page: Page, label: string) {
  const desktopTarget = page
    .getByLabel('主导航', { exact: true })
    .getByRole('button', { name: label, exact: true });
  if (await desktopTarget.isVisible()) {
    await desktopTarget.click();
    return;
  }
  const mobileNavigation = page.getByLabel('移动端主导航', { exact: true });
  if (['首页', '日历', '项目', '洞察'].includes(label)) {
    await mobileNavigation.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await mobileNavigation.getByRole('button', { name: '更多', exact: true }).click();
  await mobileNavigation.getByRole('button', { name: label, exact: true }).click();
}

/**
 * 通过种子“邮件处理”的行操作打开编辑任务 Dialog，供 viewport 与无障碍 smoke 共享。
 */
export async function openSeededTaskEditor(page: Page) {
  const task = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  await expect(task).toBeVisible();
  await task.getByRole('button', { name: '邮件处理更多操作' }).click();
  await page.getByRole('button', { name: '详细编辑', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑任务' })).toBeVisible();
}
