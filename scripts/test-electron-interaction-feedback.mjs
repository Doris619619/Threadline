/** @fileoverview 验证独立 Electron 测试窗口的装扮关闭、滚动命中与背景原生拖拽区域恢复。 */
import assert from 'node:assert/strict';

/** 仅操作调用方创建的隔离测试窗口；结束后恢复主题、页面及原有窗口尺寸。 */
export async function testElectronInteractionFeedback(application, page) {
  const original = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) => w.isVisible());
    const bounds = window.getBounds();
    window.setSize(1040, 600);
    return bounds;
  });
  await page
    .getByLabel('主导航', { exact: true })
    .getByRole('button', { name: '设置', exact: true })
    .click();
  await page.getByRole('button', { name: '外观', exact: true }).click();
  for (const theme of ['皮卡小屋', '皮卡经典']) {
    await page.getByRole('button', { name: new RegExp(theme) }).click();
    for (let attempt = 0; attempt < 3; attempt++) {
      await page
        .getByRole('button', { name: '我的装扮', exact: true })
        .filter({ visible: true })
        .click();
      const dialog = page.getByRole('dialog', { name: '我的装扮' });
      await dialog.waitFor();
      assert.equal(
        await page
          .locator('.full-window-chrome')
          .evaluate((el) =>
            getComputedStyle(el).getPropertyValue('-webkit-app-region'),
          ),
        'no-drag',
      );
      await dialog.getByRole('button', { name: '粉色外套' }).click();
      await dialog.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const close = dialog.getByRole('button', { name: '关闭装扮' });
      assert.equal(
        await close.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
        true,
        'close button remains hit-testable after scrolling',
      );
      await close.click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(
        await page
          .locator('.full-window-chrome')
          .evaluate((el) =>
            getComputedStyle(el).getPropertyValue('-webkit-app-region'),
          ),
        'drag',
      );
    }
  }
  await page.getByRole('button', { name: /默认蓝色 清爽/ }).click();
  await page
    .getByLabel('主导航', { exact: true })
    .getByRole('button', { name: '首页', exact: true })
    .click();
  await application.evaluate(({ BrowserWindow }, bounds) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.isVisible())
      .setBounds(bounds);
  }, original);
  console.log(
    'Electron interaction feedback: six wardrobe closes and drag restoration passed.',
  );
}
