/** @fileoverview 等待实际有限过渡结束，避免 WebKit 已 finished 的 transition Promise 阻塞视觉验收。 */
import { expect, type Page } from '@playwright/test';

/**
 * 跨过媒体/布局更新帧后轮询有限动画的真实状态；不关闭动画，不依赖可能未 settle 的 finished Promise。
 * 无限环境动画不属于静态样式就绪条件；有限 paused/pending 动画仍保持未就绪，按原 expect 超时报错。
 */
export async function waitForFiniteAnimations(page: Page) {
  await page.evaluate(async () => {
    void document.documentElement.offsetWidth;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          void document.documentElement.offsetWidth;
          return document
            .getAnimations()
            .filter(
              (animation) =>
                Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
                (animation.pending ||
                  !['finished', 'idle'].includes(animation.playState)),
            )
            .map((animation) => ({
              state: animation.playState,
              pending: animation.pending,
              target:
                animation.effect instanceof KeyframeEffect &&
                animation.effect.target instanceof Element
                  ? animation.effect.target.tagName +
                    '.' +
                    animation.effect.target.className
                  : undefined,
            }));
        }),
      { message: '有限动画必须结束后再检查最终配色与几何' },
    )
    .toEqual([]);
}
