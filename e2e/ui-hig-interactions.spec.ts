/** @fileoverview 以真实输入验证全模块方案 A 状态、非环形焦点、菜单与环图输入等价及认证忙碌边界。 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openWorkspaceSection } from './support/workspace';
import { expectNavigationSelection } from './support/navigation-state';
import { waitForFiniteAnimations } from './support/animations';

const themes = ['blue', 'anya', 'cottage', 'classic'] as const;
const schemes = ['light', 'dark'] as const;
const themeLabels = {
  blue: '默认蓝色',
  anya: '安妮雅',
  cottage: '皮卡小屋',
  classic: '皮卡经典',
};

/** 每次导航使用隔离的 Preview 业务状态，日期固定以使环图与表单可重复。 */
async function openPreview(page: Page) {
  await page.clock.install({ time: new Date('2026-11-19T04:00:00Z') });
  await page.goto('/');
  await expect(page.getByTestId('home-panel')).toBeVisible();
}

/** 仅切换设计系统真实主题属性，不替换组件、交互处理器或状态样式。 */
async function chooseAppearance(page: Page, theme: string, scheme: string) {
  await page.evaluate(
    ({ theme, scheme }) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.colorScheme = scheme;
    },
    { theme, scheme },
  );
}

/** 获取最终绘制的前景/祖先背景对比度，Canvas 支持浏览器计算后的 color-mix 色值。 */
async function controlState(control: Locator) {
  return control.evaluate((node) => {
    const style = getComputedStyle(node);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1, 1);
    const ancestors: Element[] = [];
    for (
      let ancestor: Element | null = node;
      ancestor;
      ancestor = ancestor.parentElement
    )
      ancestors.unshift(ancestor);
    for (const ancestor of ancestors) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = [...context.getImageData(0, 0, 1, 1).data];
    context.fillStyle = style.color;
    context.fillRect(0, 0, 1, 1);
    const foreground = [...context.getImageData(0, 0, 1, 1).data];
    /** WCAG 相对亮度仅用于文字可读性，不把轻背景状态差异误当作文字对比要求。 */
    const luminance = (channels: number[]) =>
      channels.slice(0, 3).reduce((sum, value, index) => {
        const channel = value / 255;
        return (
          sum +
          [0.2126, 0.7152, 0.0722][index] *
            (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
    const light = luminance(background),
      dark = luminance(foreground);
    return {
      background: style.backgroundColor,
      color: style.color,
      backgroundImage: style.backgroundImage,
      outline: style.outlineStyle,
      shadow: style.boxShadow,
      transform: style.transform,
      contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
      minimumContrast:
        !node.textContent?.trim() ||
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.67 && Number(style.fontWeight) >= 700)
          ? 3
          : 4.5,
    };
  });
}

/** 复用浏览器实测的有限动画轮询，避免 WebKit 已结束的 finished Promise 永不 settle。 */
async function settle(control: Locator) {
  await waitForFiniteAnimations(control.page());
}

/** 恢复一条已暂停且到时的真实演示计时，仅写隔离本机缓存，不运行计时或改写账本。 */
async function restoreExpiredTimer(page: Page) {
  const tasksKey = 'threadline.preview-demo.v1:threadline.tasks.v1';
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, tasksKey))
    .toBe(true);
  await page.evaluate((tasksKey) => {
    const tasks: { id: string; title: string }[] = JSON.parse(
      localStorage.getItem(tasksKey)!,
    );
    const task = tasks.find((task) => task.id === 'demo-stage-time-task-0');
    if (!task) throw new Error('演示缺少已到时计时验收任务');
    localStorage.setItem(
      'threadline.preview-demo.v1:threadline.task-timers.v1:local',
      JSON.stringify([
        {
          id: 'hig-expired-contrast',
          taskId: task.id,
          title: task.title,
          mode: 'down',
          targetMs: 60000,
          elapsedMs: 60000,
          firstStartedAt: Date.now() - 60000,
          entryDate: '2026-11-19',
        },
      ]),
    );
  }, tasksKey);
  await page.reload();
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.locator('.task-timer')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '延长', exact: true })).toBeVisible();
}

/** 说明文字有自己的样式；直接采其真实前景与祖先合成背景，防止父按钮通过但small仍低对比。 */
async function expectDescriptionContrast(control: Locator, label: string) {
  const descriptions = control
    .locator(
      'small, .appearance-option-label strong, .appearance-font-sample, .appearance-font-sample span',
    )
    .filter({ visible: true });
  for (const description of await descriptions.all()) {
    const state = await controlState(description);
    expect
      .soft(state.contrast, label + ' / ' + (await description.textContent())?.trim())
      .toBeGreaterThanOrEqual(state.minimumContrast);
  }
}

/** 用真实 pointerdown/up 检查短暂按下与松开恢复；在按钮外松开防止执行删除或保存。 */
async function expectControlStates(page: Page, control: Locator, label: string) {
  await control.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await control.evaluate((node) => (node as HTMLElement).blur());
  await settle(control);
  const baseline = await controlState(control);
  const selected = await control.evaluate((node) =>
    node.matches(
      '[aria-pressed="true"], [aria-selected="true"], [aria-current="page"], .tl-sidebar-item.is-active',
    ),
  );
  expect
    .soft(baseline.contrast, label + ' default text contrast')
    .toBeGreaterThanOrEqual(baseline.minimumContrast);
  await expectDescriptionContrast(control, label + ' default description');
  const bounds = (await control.boundingBox())!;
  await control.hover();
  await settle(control);
  const hover = await controlState(control);
  const hasHover = await page.evaluate(() => matchMedia('(hover: hover)').matches);
  if (hasHover) {
    if (selected)
      expect(hover.background, label + ' keeps selected on hover').toBe(
        baseline.background,
      );
    else expect(hover.background, label + ' hover').not.toBe(baseline.background);
  }
  expect
    .soft(hover.contrast, label + ' hover text contrast')
    .toBeGreaterThanOrEqual(hover.minimumContrast);
  await expectDescriptionContrast(control, label + ' hover description');
  await page.mouse.down();
  await settle(control);
  const pressed = await controlState(control);
  expect(pressed.background, label + ' pressed').not.toBe(hover.background);
  expect
    .soft(pressed.contrast, label + ' pressed text contrast')
    .toBeGreaterThanOrEqual(pressed.minimumContrast);
  await expectDescriptionContrast(control, label + ' pressed description');
  expect(pressed.transform, label + ' does not scale').toBe('none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await settle(control);
  expect((await controlState(control)).background, label + ' release').toBe(
    baseline.background,
  );
  expect(await control.boundingBox(), label + ' no layout shift').toEqual(bounds);
  // Tab 和 Shift+Tab 真实经过焦点序列，程序化 focus 只定位本次检查的起点。
  await control.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(control).toBeFocused();
  await settle(control);
  const focused = await controlState(control);
  expect(focused.outline, label + ' no surrounding focus ring').toBe('none');
  expect(focused.shadow, label + ' internal keyboard indicator').toContain('inset');
  expect
    .soft(focused.contrast, label + ' keyboard focus text contrast')
    .toBeGreaterThanOrEqual(focused.minimumContrast);
  await expectDescriptionContrast(control, label + ' keyboard description');
  await control.evaluate((node) => (node as HTMLElement).blur());
  return { baseline, hover, pressed };
}

/** 当前导航在hover保持选择，键盘焦点/pressed仍可见，松开不能改变当前页或展开聚合入口。 */
async function expectCurrentNavigation(page: Page, label: string) {
  const active = await expectNavigationSelection(page);
  const aggregate =
    (await active.getAttribute('aria-controls')) === 'mobile-more-navigation';
  if (aggregate) await expect(active).not.toHaveAttribute('aria-current');
  else await expect(active).toHaveAttribute('aria-current', 'page');
  const current = await active.getAttribute('aria-current');
  const expanded = await active.getAttribute('aria-expanded');
  const view = await page.locator('#main-content').getAttribute('data-workspace-view');
  await expectControlStates(page, active, label + ' current navigation');
  expect(await active.getAttribute('aria-current')).toBe(current);
  expect(await active.getAttribute('aria-expanded')).toBe(expanded);
  await expect(page.locator('#main-content')).toHaveAttribute(
    'data-workspace-view',
    view!,
  );
}

/** 扫描可见交互项的焦点轮廓与文本输入字号，定位模块遗留覆盖；不触发任何业务操作。 */
async function expectNoOuterFocusRings(page: Page, root: Locator) {
  const failures = await root.evaluate((container) => {
    const previous = document.activeElement as HTMLElement | null;
    const failures: string[] = [];
    for (const node of container.querySelectorAll<HTMLElement>(
      'button, input:not([type="hidden"]), textarea, select, summary, a[href], [tabindex="0"]',
    )) {
      if (!node.getClientRects().length || (node as HTMLButtonElement).disabled)
        continue;
      const before = getComputedStyle(node).boxShadow;
      node.focus({ preventScroll: true });
      // 只检查实际获得焦点的节点；异步日期数据切换期间的不可聚焦旧节点可能仍有“今天”标记。
      if (document.activeElement !== node) continue;
      const style = getComputedStyle(node);
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
        failures.push(node.outerHTML.slice(0, 160));
      if (
        style.boxShadow !== before &&
        style.boxShadow !== 'none' &&
        style.boxShadow
          .split(/,(?![^()]*\))/)
          .some((shadow) => !shadow.includes('inset'))
      )
        failures.push('outer focus shadow: ' + node.outerHTML.slice(0, 160));
      if (
        innerWidth <= 760 &&
        node.matches(
          'textarea,select,input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"])',
        ) &&
        parseFloat(style.fontSize) < 16
      )
        failures.push('small input: ' + node.outerHTML.slice(0, 160));
    }
    previous?.focus({ preventScroll: true });
    return failures;
  });
  expect(failures).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
}

// 每个主题独立使用既有180秒预算；每例保留深浅两色的完整真实输入断言，避免总循环耗尽单例时间。
for (const theme of themes)
  test(`all themes keep shared states and non-ring keyboard focus across workspace modules: ${theme}`, async ({
    page,
  }, info) => {
    await openPreview(page);
    await restoreExpiredTimer(page);
    const modules = [
      ['首页', '.finish-day'],
      ['日历', '.planning-month button[aria-label="上个月"]'],
      ['计划', '.project-section button'],
      ['习惯', '.habit-segments button:nth-child(2)'],
      ['洞察', '.insight-period-controls button:nth-child(2)'],
      ['节律', '.rhythm-calendar header button'],
      ['设置', '.settings-row'],
    ] as const;
    for (const scheme of schemes) {
      await chooseAppearance(page, theme, scheme);
      for (const [section, selector] of modules) {
        await openWorkspaceSection(page, section);
        if (section === '习惯') {
          // 月视图选择会跨页面保留；每轮先恢复周视图，使 hover 与 selected 比较同一个未选择起点。
          await page.locator('.habit-segments button').first().click();
        }
        const target =
          section === '计划'
            ? page.getByRole('button', { name: '+ 新建项目', exact: true })
            : section === '洞察'
              ? page.getByRole('button', { name: '本月', exact: true })
              : page.locator(selector).filter({ visible: true }).first();
        const states = await expectControlStates(
          page,
          target,
          `${theme}/${scheme}/${section}`,
        );
        if (section === '习惯') {
          await target.click();
          await expect(target).toHaveAttribute('aria-pressed', 'true');
          await settle(target);
          const selected = await controlState(target);
          expect(selected.background).not.toBe(states.hover.background);
          expect(selected.contrast).toBeGreaterThanOrEqual(selected.minimumContrast);
        }
        if (section === '首页' || section === '设置')
          await expectCurrentNavigation(page, `${theme}/${scheme}/${section}`);
        if (section === '首页') {
          // 采实际到时卡片后代的小号文字，不能以父卡的正文色替代“延长”按钮的实际前景。
          const timer = page.locator('.task-timer');
          await expectControlStates(
            page,
            timer.getByRole('button', { name: '延长', exact: true }),
            `${theme}/${scheme}/expired timer extension`,
          );
          for (const text of await timer
            .locator('.task-timer-heading strong, .task-timer-ended, .task-timer-date')
            .filter({ visible: true })
            .all()) {
            const state = await controlState(text);
            expect
              .soft(
                state.contrast,
                `${theme}/${scheme}/timer ${await text.textContent()}`,
              )
              .toBeGreaterThanOrEqual(state.minimumContrast);
          }
          if (page.viewportSize()!.width <= 760) {
            // 窄屏现有布局不提供鼠标绘制工具；验证真实边界，不把隐藏的桌面控件当作手机入口。
            await expect(page.locator('.annotation-tools')).toBeHidden();
          } else {
            const tools = page.getByRole('group', { name: '批注工具', exact: true });
            for (const label of ['选择模式', '荧光笔', '橡皮擦']) {
              const mode = tools.getByRole('button', { name: label, exact: true });
              await mode.click();
              await expect(mode).toHaveAttribute('aria-pressed', 'true');
              await expect(tools.locator('[aria-pressed="true"]')).toHaveCount(1);
              await expectControlStates(
                page,
                mode,
                `${theme}/${scheme}/annotation ${label}`,
              );
            }
            await tools.getByRole('button', { name: '选择模式', exact: true }).click();
          }
        }
        if (section === '设置') {
          await page.getByRole('button', { name: '外观', exact: true }).click();
          const fonts = page.locator('.appearance-font-options');
          await expect(fonts).toHaveAttribute('aria-busy', 'false');
          await expectControlStates(
            page,
            fonts.locator('.appearance-font-option[aria-pressed="true"]'),
            `${theme}/${scheme}/font choice`,
          );
        }
        await expectNoOuterFocusRings(page, page.locator('main').last());
      }
    }
    await openWorkspaceSection(page, '首页');
    await chooseAppearance(page, 'blue', 'light');
    await page.screenshot({
      path: info.outputPath('hig-workspace-states.png'),
      fullPage: true,
    });
  });

test('selection menu supports keyboard, checked selection, dismissal and focus return', async ({
  page,
}) => {
  await openPreview(page);
  const trigger = page.getByRole('button', { name: /^右栏显示内容：/ });
  await trigger.focus();
  await trigger.press('Space');
  const menu = page.getByRole('menu', { name: '右栏显示内容', exact: true });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(
    menu.getByRole('menuitemradio', { name: '任务列表', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName('右栏显示内容：今日时间分布');
  await trigger.press('Enter');
  await expect(
    menu.getByRole('menuitemradio', { name: '今日时间分布', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('heading', { name: '任务大厅', exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  for (const theme of themes)
    for (const scheme of schemes) {
      await chooseAppearance(page, theme, scheme);
      await settle(trigger);
      const closed = (await controlState(trigger)).background;
      await trigger.click();
      await expect(menu).toBeVisible();
      await settle(menu);
      expect((await controlState(trigger)).background).not.toBe(closed);
      for (const option of await menu.getByRole('menuitemradio').all()) {
        const state = await controlState(option);
        expect(
          state.contrast,
          `${theme}/${scheme}/menu text contrast`,
        ).toBeGreaterThanOrEqual(state.minimumContrast);
      }
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
});

test('ring sectors have equivalent mouse, keyboard and touch selection without hover claiming selection', async ({
  page,
}, info) => {
  await openPreview(page);
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  const chart = page.locator('[data-testid="stage-detail"] .stage-time-panel');
  const slices = await chart
    .locator('[data-stage-slice]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-stage-slice')).sort(),
    );
  const labels = await chart
    .locator('[data-stage-label]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-stage-label')).sort(),
    );
  expect(slices.length).toBeGreaterThan(0);
  expect(labels).toEqual(slices);
  for (const id of slices) {
    const callout = chart.locator(`[data-stage-label="${id}"]`);
    await callout.hover();
    await expect(callout).toHaveAttribute('aria-pressed', 'false');
    await callout.focus();
    await expect(callout).toHaveAttribute('aria-pressed', 'false');
    await callout.press('Enter');
    await expect(callout).toHaveAttribute('aria-pressed', 'true');
    await callout.press('Space');
    await expect(callout).toHaveAttribute('aria-pressed', 'false');
    if (info.project.use.hasTouch) await callout.tap();
    else await callout.click();
    await expect(callout).toHaveAttribute('aria-pressed', 'true');
    await callout.press('Enter');
  }
  await expect(chart.locator('.stage-task-row')).toHaveCount(slices.length + 2);
  const detailIds = await chart
    .locator('.stage-task-row')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-stage-task-id')),
    );
  for (const id of detailIds.filter((id) => !slices.includes(id))) {
    const title = chart.locator(`[data-stage-task-id="${id}"] .stage-task-title`);
    await title.focus();
    await title.press('Enter');
    await expect(title).toHaveAttribute('aria-pressed', 'true');
    await title.press('Space');
    await expect(title).toHaveAttribute('aria-pressed', 'false');
    if (info.project.use.hasTouch) await title.tap();
    else await title.click();
    await expect(title).toHaveAttribute('aria-pressed', 'true');
    await title.press('Enter');
  }
  await chart.getByRole('button', { name: '经典', exact: true }).click();
  const project = chart.getByRole('button', { name: /^查看 .+ 项目时间$/ }).first();
  await project.focus();
  await project.press('Enter');
  await expect(project).toHaveAttribute('aria-pressed', 'true');
  await expect(project.locator('..').locator('details')).toHaveAttribute('open', '');
  await project.press('Space');
  await expect(project).toHaveAttribute('aria-pressed', 'false');
  if (info.project.use.hasTouch) await project.tap();
  else await project.click();
  await expect(project).toHaveAttribute('aria-pressed', 'true');
  await expectNoOuterFocusRings(page, chart);
  expect(
    (await new AxeBuilder({ page }).include('.stage-time-panel').analyze()).violations,
  ).toEqual([]);
});

test('forced colors retains a system focus marker and reduced motion removes long transitions', async ({
  page,
}) => {
  await openPreview(page);
  for (const theme of themes) {
    await chooseAppearance(page, theme, 'dark');
    const finish = page.getByRole('button', { name: '结束今天', exact: true });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none' });
    await finish.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(finish).toBeFocused();
    await expect(finish).toHaveCSS('outline-style', 'none');
    expect(
      await finish.evaluate((node) =>
        parseFloat(getComputedStyle(node).transitionDuration),
      ),
    ).toBeLessThanOrEqual(0.001);
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(finish).toHaveCSS('outline-style', 'solid');
    await expect(finish).toHaveCSS('outline-offset', '-2px');
    await page.emulateMedia({ forcedColors: 'none' });
  }
});

test('filled danger actions preserve readable states in every theme without executing deletion', async ({
  page,
}, info) => {
  await openPreview(page);
  await openWorkspaceSection(page, '计划');
  const trigger = page.getByRole('button', { name: '管理项目 工作', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu', { name: '工作项目操作', exact: true });
  await expect(
    menu.getByRole('menuitem', { name: '修改项目…', exact: true }),
  ).toBeFocused();
  await menu.getByRole('menuitem', { name: '删除项目…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除项目', exact: true });
  const danger = dialog.getByRole('button', { name: '删除项目', exact: true });
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await expect(danger).not.toBeFocused();
  for (const theme of themes)
    for (const scheme of schemes) {
      await chooseAppearance(page, theme, scheme);
      await expectControlStates(page, danger, `danger/${theme}/${scheme}`);
      await expectNoOuterFocusRings(page, dialog);
      await expect(dialog).toBeVisible();
    }
  await page.screenshot({
    path: info.outputPath('hig-danger-states.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole('button', { name: '查看项目 工作', exact: true }),
  ).toBeVisible();
});

test('onboarding keeps all themes, touch targets and non-ring focus', async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'threadline.profile.preview.v1',
      JSON.stringify({
        owner_id: 'preview',
        gender: null,
        preferences_version: 0,
        onboarding_completed_at: null,
      }),
    ),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '选择喜欢的主题', exact: true }),
  ).toBeVisible();
  for (const theme of themes)
    for (const scheme of schemes) {
      const choice = page
        .locator('.appearance-theme-option')
        .filter({ hasText: themeLabels[theme] });
      await choice.click();
      await chooseAppearance(page, theme, scheme);
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await expectControlStates(
        page,
        choice,
        `onboarding/${theme}/${scheme}/theme choice`,
      );
      await expectControlStates(
        page,
        page.getByRole('button', { name: '继续', exact: true }),
        `onboarding/${theme}/${scheme}`,
      );
      await expectNoOuterFocusRings(page, page.locator('.onboarding-card'));
    }
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '进入工作台', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('男生', { exact: true }).check();
  await expect(
    page.getByRole('button', { name: '进入工作台', exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('hig-onboarding.png'),
    fullPage: true,
  });
});

test('real authentication form preserves busy feedback and prevents repeated submission', async ({
  page,
}, info) => {
  let release!: () => void;
  let requests = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('http://127.0.0.1:3198/**', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
        },
      });
    requests++;
    await pending;
    await route.fulfill({
      status: 400,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: '隔离测试的模拟登录失败',
      }),
    });
  });
  await page.goto(process.env.THREADLINE_HIG_AUTH_URL ?? 'http://127.0.0.1:3120');
  await page.getByRole('button', { name: '使用指定账号继续', exact: true }).click();
  const login = page.getByRole('button', { name: '登录', exact: true });
  if (page.viewportSize()!.width <= 760) {
    for (const control of await page
      .locator('.auth-icon-btn, .auth-input-action-btn')
      .all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(
        await control.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          );
        }),
      ).toBe(true);
    }
  }
  for (const theme of themes)
    for (const scheme of schemes) {
      await chooseAppearance(page, theme, scheme);
      await expectControlStates(page, login, `auth/${theme}/${scheme}`);
      await expectNoOuterFocusRings(page, page.locator('.auth-gate'));
    }
  await page.getByLabel('邮箱', { exact: true }).fill('hig-fixture@example.invalid');
  const password = page.getByLabel('密码', { exact: true });
  await password.fill('isolated-ui-fixture');
  const reveal = page.getByRole('button', { name: '显示密码', exact: true });
  await expect(reveal).toHaveCount(1);
  await reveal.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('isolated-ui-fixture');
  await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('isolated-ui-fixture');
  expect(requests).toBe(0);
  await login.click();
  await expect(login).toBeDisabled();
  await expect(page.locator('.auth-form-card')).toHaveAttribute('aria-busy', 'true');
  await password.press('Enter');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(requests).toBe(1);
  release();
  await expect(page.locator('.auth-error[role="alert"]')).toContainText(
    '隔离测试的模拟登录失败',
  );
  await expect(login).toBeEnabled();
  await expect(page.locator('.auth-form-card')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({
    path: info.outputPath('hig-authentication.png'),
    fullPage: true,
  });
});
