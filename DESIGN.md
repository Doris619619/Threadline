<!-- 文件用途：从已实现的 Threadline 界面记录主题、设计令牌、组件和统一交互规则，供后续界面开发复用。 -->

# Design System: Threadline

## Overview

**Creative North Star: "Apple 应用交互 · 方案 A / P1"**

Threadline 的工作界面以安静的内容表面、明确的文字层级和克制的背景反馈承载高密度任务。用户已指定 Apple 应用按钮和 P1 弹出菜单作为交互参照；这里记录已落地的 Web、iPhone PWA 与 Electron 共用系统，不另造品牌隐喻，也不将这些 Web 像素值解释为 Apple 官方要求。

四套主题保留各自配色与既有美术：默认蓝色、安妮雅粉色、皮卡小屋和皮卡经典。主题、深浅色与字体是独立选择。统一的是状态含义、输入可达性与菜单行为；小屋的像素材质、经典的页签和现有插画无需改造成同一种外观。

**Key Characteristics:**

- 背景先表达反馈；键盘焦点增加内部底线，普通模式不用外围焦点环。
- 主操作、危险操作和中性操作共享状态顺序，各自保留可读的前景。
- 菜单靠近触发器，柔和半透明，动作、互斥选择与复杂表单各用相应语义。
- 桌面保持紧凑，手机扩大真实命中目标，极小计时站通过滚动保留可达性。

以下表格及代码块为本次提取的规范令牌；运行时事实来源仍是拥有这些值的 CSS。仓库要求 Markdown 首行说明，因此不使用可选 YAML frontmatter；机器扩展、交互片段和元数据位于 [.impeccable/design.json](.impeccable/design.json)。

事实来源：[全局令牌](src/styles/tokens.css)、[主题与字体](src/features/appearance/appearance.css)、[小屋](src/features/appearance/cottage.css)、[经典](src/features/appearance/classic.css)、[经典控件](src/features/appearance/classic-controls.css)、[共享控件](src/components/ui/ui.css)、[统一状态](src/styles/interactions.css)、[菜单](src/features/tasks/task-menus.css)。样式顺序由 [global-styles.ts](src/app/global-styles.ts) 管理，菜单及统一状态在主题与业务样式之后加载。方向契约见 [apple-interactions.md](docs/apple-interactions.md)，截图来源见 [证据说明](docs/screenshots/apple-interactions/README.md)；截图不代替行为验证。

## Colors

配色以主题内的语义角色工作，不能把默认蓝色写死进共享组件。下表每个颜色的文档令牌名为 `{外观}-{角色}`，例如 `blue-light-accent`；运行时使用列标题对应的 CSS 变量。

### Primary

| 外观          | `accent` 填色 | `accent-text` 浅底文字 | `text-on-accent` 填色前景 | `accent-soft` 低强调底色 | `accent-border` |
| ------------- | ------------- | ---------------------- | ------------------------- | ------------------------ | --------------- |
| blue-light    | `#0066d6`     | `#0066d6`              | `#ffffff`                 | `#e8f1ff`                | `#b6d4ff`       |
| blue-dark     | `#0066d6`     | `#78b9ff`              | `#ffffff`                 | `#182c46`                | `#365f8c`       |
| anya-light    | `#a63e65`     | `#a63e65`              | `#fffbfc`                 | `#f9dce6`                | `#d995ad`       |
| anya-dark     | `#f3adc6`     | `#f6b9d0`              | `#3c2130`                 | `#583646`                | `#a46a84`       |
| cottage-light | `#81618f`     | `#795984`              | `#fffdf7`                 | `#f2e5f0`                | `#cfb5d4`       |
| cottage-dark  | `#d7b5e1`     | `#e0c0e7`              | `#302437`                 | `#4c3b55`                | `#9e80ab`       |
| classic-light | `#9e5100`     | `#915000`              | `#fffef1`                 | `#fff1cc`                | `#d9a533`       |
| classic-dark  | `#e8c078`     | `#e8c078`              | `#302108`                 | `#44403a`                | `#b5924d`       |

小屋的主要按钮使用 `pixel-jade` / `pixel-on-jade`：浅色（`#567957` / `#fffdf1`）、深色（`#b2cea5` / `#263722`）。经典主要按钮由后加载的经典控件恢复为主题 accent。两种主题的引导页主按钮固定使用 `onboarding-control-fill`（`#405f40`）及 `onboarding-control-ink`（`#fffdf7`）；状态也沿用这组前景，不能套用深色主题浅 accent 所需的深字。

### Secondary

Daily 使用独立的 `daily-accent`，状态仍遵循共享系统。它是既有业务角色，不是增加第二套按钮状态的理由。

| 角色         | blue light / dark     | anya light / dark     | cottage light / dark  | classic light / dark  |
| ------------ | --------------------- | --------------------- | --------------------- | --------------------- |
| daily-accent | `#7559d9` / `#b8a5ff` | `#97647d` / `#e3a6ca` | `#9b627d` / `#e0b0c4` | `#58720c` / `#bfd785` |
| success      | `#248a4d` / `#75d59a` | `#326a48` / `#a6d4ac` | `#496c45` / `#b0d799` | `#4b700d` / `#c2df8a` |
| warning      | `#a86400` / `#f3bd64` | `#875b20` / `#ecc28a` | `#8b6122` / `#edc37f` | `#8b5500` / `#ffd17b` |
| danger       | `#d92d20` / `#ff8a80` | `#b03f3c` / `#ffaba0` | `#b04d3f` / `#ffa99a` | `#b22c25` / `#ffb0a0` |

填色危险按钮所有主题均用 `danger-filled`（`#b42318`）和 `danger-on-filled`（`#ffffff`）。菜单危险文字使用主题 `danger`，不能把浅色危险文字当成填色按钮背景。计划热度、日历热度、像素框架及插画色继续由各自主题 CSS 管理，不提升为新页面的通用强调色。

### Neutral

| 外观          | `background` 页面 | `surface` 内容 | `surface-secondary` 次级面 | `text-primary` | `text-secondary` | `text-tertiary` |
| ------------- | ----------------- | -------------- | -------------------------- | -------------- | ---------------- | --------------- |
| blue-light    | `#f2f2f7`         | `#ffffff`      | `#f6f7f9`                  | `#1d1d1f`      | `#6e6e73`        | `#86868b`       |
| blue-dark     | `#000000`         | `#1c1c1e`      | `#2c2c2e`                  | `#f2f2f7`      | `#b1b1b8`        | `#a0a0a8`       |
| anya-light    | `#fff2f5`         | `#fffbfc`      | `#fcebf0`                  | `#4b3340`      | `#79616c`        | `#846a76`       |
| anya-dark     | `#291e26`         | `#372630`      | `#45323e`                  | `#fff0f5`      | `#dfc4d0`        | `#c7a6b6`       |
| cottage-light | `#faf7f2`         | `#fffdf7`      | `#f7efdc`                  | `#50454b`      | `#78656f`        | `#806e77`       |
| cottage-dark  | `#262431`         | `#302d3b`      | `#3b3545`                  | `#f6edec`      | `#d1bfcc`        | `#c9b6c5`       |
| classic-light | `#faf8f3`         | `#fffefa`      | `#f5f1e8`                  | `#292722`      | `#6b665d`        | `#746b60`       |
| classic-dark  | `#242832`         | `#30343e`      | `#292d36`                  | `#fff7d4`      | `#d4ccc0`        | `#bdb5a6`       |

| 外观          | `border` 字段与控件 | `border-subtle` 容器与分组 | `border-strong` 小标记 |
| ------------- | ------------------- | -------------------------- | ---------------------- |
| blue-light    | `#e6e8ee`           | `#eceef2`                  | `#d7dbe3`              |
| blue-dark     | `#48484a`           | `#38383a`                  | `#636366`              |
| anya-light    | `#ebcdd7`           | `#f2dfe6`                  | `#c398aa`              |
| anya-dark     | `#71505f`           | `#59404d`                  | `#a88293`              |
| cottage-light | `#d7c4a4`           | `#e7dcc8`                  | `#ac91a3`              |
| cottage-dark  | `#706171`           | `#514653`                  | `#9c88a1`              |
| classic-light | `#d8cdbb`           | `#e9e1d5`                  | `#916019`              |
| classic-dark  | `#8c8064`           | `#4b4c51`                  | `#bca16b`              |

共享状态的颜色公式保留源 CSS 的 `color-mix()`，不换算成只适合某一主题的近似色：

```css
--interaction-hover: color-mix(in srgb, var(--text-primary) 5%, var(--surface));
--interaction-pressed: color-mix(in srgb, var(--text-primary) 7%, var(--surface));
--interaction-expanded: color-mix(in srgb, var(--accent-text) 9%, var(--surface));
--interaction-selected: color-mix(in srgb, var(--accent-text) 13%, var(--surface));
--interaction-focus: color-mix(in srgb, var(--accent-text) 16%, var(--surface));
--interaction-focus-ink: var(--accent-text);
--interaction-danger-hover: color-mix(in srgb, var(--danger) 8%, var(--surface));
--interaction-danger-pressed: color-mix(in srgb, var(--danger) 15%, var(--surface));
--menu-surface: color-mix(in srgb, var(--surface) 94%, transparent);
```

**The Semantic State Rule.** 主题映射语义颜色，不能另建一套 hover、pressed、selected 或键盘焦点逻辑。

## Typography

**Display Font / Body Font:** 同一套用户选择的 `font-sans`；没有独立营销展示字体。默认栈为 `-apple-system, BlinkMacSystemFont, system-ui, 'PingFang SC', 'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`。这是工作台正文与控件的实际系统字体，不构成新展示字的推荐。

**独立字体选择：** `Threadline Source Han Sans`（本地可变字重 250–900）或 `Threadline Source Han Serif`（200–900），后接默认栈；选择不会改变主题或身份。加载失败回退到默认字，并保留可重试提示。来源为 `appearance.css` 及 [appearance-store.ts](src/features/appearance/appearance-store.ts)。

### Hierarchy

| 文档令牌 / CSS 前缀          | 用途             | 桌面字号    | 行高   | 字重  | ≤760px      |
| ---------------------------- | ---------------- | ----------- | ------ | ----- | ----------- |
| page / `text-page`           | 页面标题         | `1.375rem`  | `1.2`  | `700` | `1.75rem`   |
| section / `text-section`     | 分区标题         | `1.0625rem` | `1.3`  | `600` | 同桌面      |
| card / `text-card`           | 卡片标题         | `1rem`      | `1.35` | `600` | 同桌面      |
| body / `text-body`           | 正文             | `0.9375rem` | `1.45` | `400` | `1.0625rem` |
| secondary / `text-secondary` | 辅助说明         | `0.8125rem` | `1.4`  | `400` | `0.875rem`  |
| label / `text-label`         | 标签             | `0.8125rem` | `1.3`  | `500` | 同桌面      |
| caption / `text-caption`     | 元数据、项目标记 | `0.75rem`   | `1.35` | `400` | `0.8125rem` |

共享按钮使用 label 字号，但实际字重为 600、行高为 1。计时和统计数字使用等宽数字；不对所有正文强制等宽。经典主题将 page 提到 `1.75rem` / 800、section 提到 `1.125rem` / 700，body 为 `1rem`，secondary 和 label 为 `0.875rem`，caption 为 `0.8125rem`；实际经典页面标题选择器仍可使用 700。手机经典正文同样为 `1.0625rem`。

**The Independent Font Rule.** 新界面继承 `font-sans`，不通过主题选择覆盖用户字体；手机可编辑控件遵循 `mobile-form-control-font-size: max(1rem, var(--text-body-size))`，不降回桌面紧凑标签字号。

## Layout

间距基于 4px 节奏，允许已有组件中的功能性补充值。全局间距令牌为 `space-1: 4px`、`space-2: 8px`、`space-3: 12px`、`space-4: 16px`、`space-5: 20px`、`space-6: 24px`、`space-8: 32px`。共享按钮水平留白使用 space-4，紧凑按钮及输入使用 space-3；各业务容器保留自己的布局职责。

桌面侧栏令牌 `sidebar-width` 为 188px，主内容留白为 `24px 28px 32px`。≤760px 时侧栏成为五列底部导航，`bottom-nav-height` 为 64px，叠加安全区；内容留白为 `16px 16px calc(64px + 20px + env(safe-area-inset-bottom))`。日期栏与工具栏在窄屏换行，文本可换行而不是挤占相邻操作。来源：[app-shell.css](src/components/app-shell.css)。

普通控件最小高度 `control-height` 为 36px，紧凑档为 32px，`touch-target` 为 44px。菜单项在 ≤760px 或 coarse pointer 下升为 44px；日期导航、认证图标、任务项目入口等扩大真实元素，而非用溢出的伪元素覆盖邻近点击区。并非所有桌面按钮都强制 44px。极小 Electron 计时站使用原尺寸卡片和滚动，保留可达的 36px 操作，不以继续压缩整个界面换取装入窗口；其特例由 [timer-station.css](src/features/tasks/timer-station.css) 管理。

## Elevation & Depth

内容靠语义表面、轻边界和主题材质分层；浮层使用更明确的柔和阴影和背景模糊。半透明材质是菜单与披露浮层的功能边界，不是每张内容卡片都要套用的效果。既有小屋像素的阶梯阴影及经典美术继续在主题内使用，不据此给其它主题增加硬偏移阴影。

### Shadow Vocabulary

| 令牌           | 默认值                                                   | 用途                               |
| -------------- | -------------------------------------------------------- | ---------------------------------- |
| shadow-card    | `0 1px 2px rgb(0 0 0 / 4%), 0 4px 12px rgb(0 0 0 / 4%)`  | raised 共享表面；blue-dark 为 none |
| shadow-window  | `0 8px 28px rgb(0 0 0 / 8%)`                             | 窗口型内容与对话框                 |
| shadow-popover | `0 8px 24px rgb(0 0 0 / 10%)`                            | 既有普通浮层回退                   |
| menu-shadow    | `0 8px 32px rgb(0 0 0 / 14%), 0 2px 8px rgb(0 0 0 / 5%)` | 统一菜单与共享材质披露             |

安妮雅覆盖 card 为 `0 2px 3px rgb(69 44 31 / 3%), 0 8px 24px rgb(69 44 31 / 4%)`、window 为 `0 8px 28px rgb(69 44 31 / 9%)`、popover 为 `0 10px 32px rgb(69 44 31 / 13%)`；安妮雅暗色 card 为 `0 1px 0 rgb(233 213 184 / 4%)`。小屋 card 浅色为 `0 2px 0 #e7dcc8`、暗色为 `0 2px 0 #201d28`，popover 为 `0 8px 28px rgb(72 51 58 / 13%)`。经典 card 为 `0 2px 8px rgb(80 55 20 / 3%)`，但主要内容面板明确使用 none。具体组件可选择 flat 变体，不把所有表面一律浮起。

**The Functional Layer Rule.** 统一菜单使用 `blur(20px) saturate(1.15)` 和 menu-shadow；复杂表单只共享适合的材质，不因此套用动作菜单键盘模型。

## Shapes

全局圆角令牌为 `radius-sm: 8px`、`radius-md: 12px`、`radius-lg: 16px`；control、card、surface 分别映射到这三档。菜单另用 `menu-radius: 18px`，菜单项为 10px。它们区分触发控件、内容表面与浮层，而不是让每个对象都成为胶囊。

小屋 control / card / surface 为 4 / 5 / 6px；实际小屋共享按钮和未聚焦输入沿用主题 3px 像素角。经典 control / card / surface 为 8 / 10 / 10px，由后加载的经典控件覆盖小屋遗留角型；经典对话框为 16px。菜单继续统一 18px。复选框常态标记为 18px、6px 圆角，手机标记为 22px，外部真实点击区域为 44px；外观和点击区域不能混为一谈。

## Components

下面的组件令牌用于默认 blue-light 预览，主题与交互覆盖仍按各节执行；引用名对应前文颜色表、字号表和圆角 / 间距令牌。

```yaml
components:
  button-primary:
    {
      backgroundColor: '{colors.blue-light-accent}',
      textColor: '{colors.blue-light-text-on-accent}',
      rounded: '{rounded.radius-sm}',
      padding: '0 16px',
      height: '36px',
    }
  button-secondary:
    {
      backgroundColor: '{colors.blue-light-surface}',
      textColor: '{colors.blue-light-text-primary}',
      rounded: '{rounded.radius-sm}',
      padding: '0 16px',
      height: '36px',
    }
  button-quiet:
    {
      backgroundColor: 'transparent',
      textColor: '{colors.blue-light-accent}',
      rounded: '{rounded.radius-sm}',
      padding: '0 16px',
      height: '36px',
    }
  button-danger:
    {
      backgroundColor: '{colors.danger-filled}',
      textColor: '{colors.danger-on-filled}',
      rounded: '{rounded.radius-sm}',
      padding: '0 16px',
      height: '36px',
    }
  input:
    {
      backgroundColor: '{colors.blue-light-surface}',
      textColor: '{colors.blue-light-text-primary}',
      rounded: '{rounded.radius-sm}',
      padding: '0 12px',
      height: '36px',
      width: '100%',
    }
  navigation:
    {
      backgroundColor: 'transparent',
      textColor: '{colors.blue-light-text-secondary}',
      rounded: '{rounded.radius-md}',
      padding: '0 12px',
      height: '40px',
    }
  project-tag:
    { textColor: '{colors.blue-light-accent-text}', typography: '{typography.caption}' }
  surface:
    {
      backgroundColor: '{colors.blue-light-surface}',
      textColor: '{colors.blue-light-text-primary}',
      rounded: '{rounded.radius-lg}',
    }
  menu:
    {
      backgroundColor: 'color-mix(in srgb, var(--surface) 94%, transparent)',
      textColor: '{colors.blue-light-text-primary}',
      rounded: '18px',
      padding: '6px',
    }
  appearance-mode:
    {
      backgroundColor: '{colors.blue-light-surface}',
      textColor: '{colors.blue-light-text-primary}',
      rounded: '10px',
      padding: '8px 20px',
      height: '44px',
    }
```

### Buttons

共享按钮以填色、轻边界和无底色三种强调程度工作，保持相同状态语义。

| 文档组件令牌     | 背景                      | 文字                                 | 圆角                           | 水平内边距 | 最小高度 |
| ---------------- | ------------------------- | ------------------------------------ | ------------------------------ | ---------- | -------- |
| button-primary   | accent；小屋用 pixel-jade | text-on-accent；小屋用 pixel-on-jade | radius-control，含主题实际覆盖 | 16px       | 36px     |
| button-secondary | surface                   | text-primary                         | radius-control，含主题实际覆盖 | 16px       | 36px     |
| button-quiet     | transparent               | accent                               | radius-control，含主题实际覆盖 | 16px       | 36px     |
| button-danger    | danger-filled             | danger-on-filled                     | radius-control，含主题实际覆盖 | 16px       | 36px     |
| button-compact   | 继承强调变体              | 继承强调变体                         | 同上                           | 12px       | 32px     |

状态由 `interactions.css` 最后统一：仅 hover 设备显示 hover；中性按下使用 interaction-pressed，填色按钮 hover / pressed 为自身填色与 black 的 92% / 82% 混合。保持填色前景；普通按钮在状态中使用 text-primary。expanded 使用 9% accent-text 背景，selected 使用 13%，两者持续含义分别绑定 `aria-expanded` 与真实选择属性。`:active` 位于优先级末端，按住时短暂覆盖，释放后恢复持续状态；无缩放和几何跳动。

键盘 `:focus-visible` 为清晰背景与 `inset 0 -2px 0` 内底线；填色按钮底线使用可读的填色前景。指针焦点不留下外围轮廓。禁用使用 opacity 0.48、surface-secondary 背景和 text-secondary；忙碌继续显示既有加载反馈并使用 progress 光标，业务保存屏障负责禁止重复提交，不能只靠 CSS。

状态过渡 `motion-fast: 140ms`（ease），按下 `motion-press: 80ms`，菜单淡入 `motion-menu: 140ms`（ease-out）。减少动画时过渡为 0.01ms、菜单不播放进入动画；强制色时允许 `2px solid Highlight`、offset -2px 的系统轮廓。

### Chips / Project Tags

共享项目标记是无底色的短文字，使用 accent-text 与 caption 字号 / 字重 / 行高，保持单行。它不是自动可点击的胶囊；有项目选择行为时由真实按钮、搜索列表框与可读标签承载。来源：`ui.css` 与 [project-picker.css](src/components/ui/project-picker.css)。

### Cards / Containers

共享 surface 使用 surface 背景、1px border-subtle 和 radius-surface。raised 变体加 shadow-card，flat 变体明确无阴影。基础表面没有统一内边距；由所在业务模块的网格与内容定义。不要从单张截图发明全局卡片 padding。

### Inputs / Fields

共享输入宽度 100%，36px 最小高度、水平 12px 内边距、surface 背景、text-primary 文字、1px border 边界。placeholder 使用 text-tertiary，错误边界使用 danger。编辑焦点改变边界为 interaction-focus-ink，不加发光环；无边框编辑区保留所属组件的内部底线。隐形日期和复选框把键盘反馈传到可见标签；搜索区域可使用 focus-within 背景及内底线。手机文字、日期、下拉与可编辑区域的实际字号由最终响应式覆盖保护。来源：[responsive-overrides-late.css](src/styles/responsive-overrides-late.css)。

### Navigation

桌面导航行最小高度 40px，左右 12px 内边距，12px 图文间距，使用 label 层级；默认 text-secondary，当前位置使用 accent-text、accent-soft 与 600 字重。既有 3px 侧标记表达当前位置，手机隐藏该标记并改为五列图文底栏。安妮雅与经典保留主题内的选中侧线，不将其误当成装饰或推广到普通卡片。选择语义通过真实 `aria-current` / `aria-pressed` 等属性进入共享状态系统。

### Menus & Disclosures

菜单使用 18px 外角、6px 容器内边距，通常最小宽度 188px（工作站 144px），宽高受可见视口各减 16px 限制并允许内部滚动。菜单项为 10px 圆角，36px 最小高度、`8px 10px` 内边距、8px 图文间距、`0.875rem / 1.4`；触摸为 44px 最小高度。分组线为 border-subtle，外边距 `5px 8px`。互斥选择以对勾和 `aria-checked` 表达，危险项单独分组。

菜单进入浏览器顶层，按真实 visualViewport 在触发器附近定位并避让边缘；选中或执行后关闭，Escape、外部点击与 Tab 退出，方向键及 Home/End 在有效菜单项间移动，关闭后归还真实触发器。项目命令进入表单时保留原触发器，删除确认初始焦点为取消。项目搜索仍是列表框，复杂编辑与确认仍是表单，不将全部浮层改成 menu。来源：[TaskActionsPopover](src/features/tasks/components/task-actions-popover.tsx)、[popover-position.ts](src/components/ui/popover-position.ts)、[HomeSideMenu](src/features/tasks/components/home-side-menu.tsx)。

强制色时菜单改用 Canvas / CanvasText 边界且去掉模糊；半透明不能成为无法辨认菜单边界的前提。

**The Focus Before Reset Rule.** 先给可见控件建立背景、内部底线或编辑边界，再移除普通外围轮廓；原生隐藏输入必须把反馈传给用户能看到的元素。

## Do's and Don'ts

### Do:

- **Do** 从语义 CSS 变量取得表面、文字与状态颜色，并检查四主题深浅色。
- **Do** 保留主题和字体的独立选择，以及经典、小屋已有的美术资产与语义侧标记。
- **Do** 区分持续选择、菜单展开和短暂按下，使用相应的真实 ARIA 状态。
- **Do** 复用最后加载的状态系统，并为键盘提供背景、内部底线或编辑边界反馈。
- **Do** 扩大真实触屏目标、保留菜单视口避让，并尊重减少动画与强制色偏好。

### Don't:

- **Don't** 恢复普通外围焦点环、点击后发光、按下缩放或状态引起的布局跳动。
- **Don't** 用 hover 冒充 selected，或让固定深色填色继承不适合它的深色前景。
- **Don't** 把复杂表单和确认强制包装成动作菜单，或仅用 CSS 忙碌样式阻止重复提交。
- **Don't** 给新页面添加重复眉题、无必要提示文案，或将既有单页特例推广为全局装饰。
- **Don't** 把像素主题原生材质一律清除，或把其硬偏移阴影复制到其它主题。

未规范化的既有差异：计时站局部固定字体与辅助字号、业务图表和主题美术中的专用值仍由所属模块管理；它们不是后续通用界面的新令牌。本记录不修复这些既有差异，也不把截图或模拟浏览器通过视为实体 iPhone 与所有显示器的人工验收。
