/** @fileoverview 用隔离更新 bridge 验证标题栏轻量入口、导航、主题、窄窗与安装确认。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';
import type { DesktopUpdateState } from '../src/lib/desktop-update';

test('keeps update actions visible across navigation, themes, download and compact mode', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let state = {
      status: 'available',
      revision: 1,
      currentVersion: '0.1.3',
      version: '0.1.4',
    } as DesktopUpdateState;
    let listener: ((value: DesktopUpdateState) => void) | undefined;
    let nativeRevision = 0;
    /** 模拟 Main 权威状态事件；只供测试，不连接公开更新源。 */
    const publish = (patch: Partial<DesktopUpdateState>) => {
      state = { ...state, ...patch, revision: state.revision + 1 };
      listener?.(state);
      return Promise.resolve(state);
    };
    Object.defineProperty(window, 'threadlineDesktop', {
      value: {
        environment: 'electron',
        role: 'main',
        getUpdateState: async () => state,
        onUpdateState: (callback: typeof listener) => {
          listener = callback;
          return () => {
            listener = undefined;
          };
        },
        downloadUpdate: () => publish({ status: 'downloading', percent: 42 }),
        checkForUpdate: () => publish({ status: 'available' }),
        installUpdate: () => publish({ status: 'installing' }),
        hydrateDesktopState: async (command: Record<string, unknown>) => ({
          ...command,
          stateRevision: ++nativeRevision,
          geometry: { x: 0, y: 0, width: 1280, height: 800 },
          visibleSurface: 'main',
          fallback: false,
        }),
        transitionWindow: async (command: Record<string, unknown>) => ({
          ...command,
          stateRevision: ++nativeRevision,
          geometry: { x: 0, y: 0, width: 360, height: 640 },
          visibleSurface: 'main',
          fallback: false,
        }),
        onNativeStateChanged: () => () => undefined,
        onNativeGeometryChanged: () => () => undefined,
        onPresentationRollback: () => () => undefined,
        onMainWindowMaximizeChanged: () => () => undefined,
        getMainWindowMaximized: async () => false,
        resizeCompactContent: async () => undefined,
        setAppearanceTheme: async () => undefined,
      },
    });
    window.addEventListener('test-update-state', (event) => {
      void publish((event as CustomEvent).detail);
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootstrapLocalAdapterWorkspace(page, 'desktop-update');
  const entry = page.locator('.desktop-update-trigger');
  const details = page.getByRole('region', { name: '软件更新详情' });
  await expect(entry).toBeVisible();
  await expect(details).toBeHidden();
  const box = (await entry.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(28);
  expect(box.width).toBeLessThanOrEqual(90);
  expect((await page.locator('.tl-window-body').boundingBox())!.y).toBe(40);
  await page.screenshot({ path: testInfo.outputPath('update-blue.png') });
  await openWorkspaceSection(page, '项目');
  await expect(entry).toBeVisible();
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: /安妮雅/ }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await openWorkspaceSection(page, '首页');
  await page.screenshot({ path: testInfo.outputPath('update-dark.png') });
  await entry.press('Enter');
  await expect(details.getByRole('button', { name: '下载更新' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('.desktop-update-popover').analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(entry).toBeFocused();
  await expect(details).toBeHidden();
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await openWorkspaceSection(page, '首页');
  await page.screenshot({ path: testInfo.outputPath('update-light.png') });
  await entry.click();
  await page.screenshot({ path: testInfo.outputPath('update-details.png') });
  expect(
    (await new AxeBuilder({ page }).include('.desktop-update-popover').analyze())
      .violations,
  ).toEqual([]);
  await details.getByRole('button', { name: '下载更新' }).click();
  await expect(details.getByRole('progressbar')).toHaveAttribute('value', '42');
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-update-state', {
        detail: { status: 'downloaded', percent: 100 },
      }),
    ),
  );
  await expect(entry).toHaveText('重启更新');
  await expect(details).toBeHidden();
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator('.compact-window-header')).toBeVisible();
  await expect(entry).toBeVisible();
  expect((await entry.boundingBox())!.height).toBeLessThanOrEqual(28);
  await page.screenshot({ path: testInfo.outputPath('update-compact.png') });
  await entry.click();
  const panel = (await details.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(8);
  expect(panel.x + panel.width).toBeLessThanOrEqual(352);
  await details.getByRole('button', { name: '重启并更新' }).click();
  const dialog = page.getByRole('dialog', { name: '重启并更新' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '稍后' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
