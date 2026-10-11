/** @fileoverview 使用 Windows 可见边界检查入口窗口居中，并验证静态包内欢迎页和登录页插画能实际解码。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** 只检查调用者拥有的进程；DWM 和 monitor 同用物理坐标，允许最多一 DIP 的边框取整。 */
export function verifyEntryWindowCenter(processId) {
  const geometry = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        join(import.meta.dirname, 'read-windows-visible-geometry.ps1'),
        '-ProcessId',
        String(processId),
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
    ),
  );
  const { bounds, area, scaleFactor } = geometry;
  for (const [position, size] of [
    ['x', 'width'],
    ['y', 'height'],
  ]) {
    const delta = Math.abs(
      bounds[position] + bounds[size] / 2 - area[position] - area[size] / 2,
    );
    assert.ok(
      delta <= scaleFactor,
      `Visible entry window must be centered within one DIP (${position}): ${JSON.stringify(geometry)}`,
    );
  }
  console.log('Visible entry geometry verified:', JSON.stringify(geometry));
  return geometry;
}

/** 解码实际 DOM 图片并检查走静态协议；不以文件存在或 HTTP 200 代替可见资源验收。 */
async function verifyImage(page, selector, path) {
  const image = page.locator(selector);
  await image.waitFor({ state: 'visible' });
  const result = await image.evaluate(async (element) => {
    await element.decode();
    return {
      src: element.currentSrc,
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
  });
  assert.equal(result.src, `threadline://app${path}`);
  assert.ok(result.width > 0 && result.height > 0, `Image must decode: ${path}`);
}

/** 检查欢迎→登录→返回，不登录账号或写入业务云；可选保存修复后的欢迎页截图。 */
export async function verifyEntryIllustrations(page) {
  await page.locator('.auth-gate').waitFor();
  await verifyImage(page, '.auth-illustration-img', '/auth/welcome-illustration.jpg');
  if (process.env.THREADLINE_ENTRY_SCREENSHOT)
    await page.screenshot({ path: process.env.THREADLINE_ENTRY_SCREENSHOT });
  await page.getByRole('button', { name: '使用指定账号继续', exact: true }).click();
  await page.locator('input[type=email]').waitFor();
  await page.locator('input[type=password]').waitFor();
  await verifyImage(page, '.auth-bg-illustration-img', '/auth/login-illustration.jpg');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await verifyImage(page, '.auth-illustration-img', '/auth/welcome-illustration.jpg');
}
