<!-- 文件用途：定义 Threadline 前端样式与任务工作台模块的归属边界，并记录重构期间必须保持的兼容性约束。 -->

# 前端样式与模块归属

## CSS 入口与顺序

`src/app/global-styles.ts` 是 Web 与 Electron 共用的有序样式入口；`src/app/globals.css` 仅负责 Tailwind。两者均不得新增业务 selector。

当前拆分严格保持旧 `globals.css` 的区块顺序：token、基础规则、UI primitive、Electron 窗口、紧凑任务、应用壳、任务、Daily、项目、复盘、统计/设置、历史、前置兼容响应式、跨功能页面规则、后置兼容响应式、Insights 打印、认证与启动。

## Owner 规则

- `src/styles/tokens.css`：仅 CSS custom properties，包括色板、字号阶梯（page/section/card/body/secondary/label/caption）、圆角、间距、阴影、触控尺寸与运动时长。
- `src/styles/base.css`：reset、文档根节点、全局 focus、reduced motion 与跨 feature 的 `.empty-copy`。
- `src/components/ui/ui.css`：只服务于 `components/ui` 输出的 `.tl-*` primitive，不放页面布局。`Surface` 提供 `raised` / `flat` 两档。
- `src/components/app-shell.css`：Web/PWA 导航、主内容区、日期栏、账户 disclosure 与 **760px 底栏导航**；disclosure 使用普通 button/popover 语义，不添加 `role="menu"`。
- `src/styles/desktop-window.css`：Electron Full、Compact、Edge 与 `-webkit-app-region`；Full 使用纵向 flex，避免 Web 无标题栏时预留空行。窄屏将 `.tl-window-body` 改为单列，让固定底栏不占用侧栏网格。
- `src/features/tasks/task-dashboard.css`：首页仪表盘、今日日程七列网格、手机连续双行任务列表（同一 DOM，760px 切换 `grid-template-areas`）、无时间待办与首页胶囊统计。
- `src/features/tasks/task-estimates.css`：独立预计分钟输入、清空操作、预览及各任务表单中的排布。
- `src/features/startup/threadline-startup.css`：认证完成前与工作区 hydration 期间的全屏启动页；只服务四个真实启动阶段，不承载认证、query 或 Realtime 业务逻辑。
- `src/features/feature-pages.css`：Calendar、Insights、Rhythm 共用的页面信息架构 selector；只有 selector 本身跨多个 feature 时才允许放入这里。
- `src/features/<feature>/`：该 feature 自己渲染的业务 selector 和已审计的响应式规则。

为严格保持历史 CSS rule order，少数 grouped selector 仍随其原始连续规则块落在最接近的 feature 文件中：例如 `calendar.css` 可包含 Rhythm selector，`insights.css` 可包含 Records 输入 selector。这是有意的兼容层设计，不代表 CSS ownership 漏分。

Insights 使用 `insights.css`（主页面及手机响应式规则）、`insights-report.css`（必须晚于 Rhythm 的报告基础规则）与始终最后加载的 `insights-print.css`；Settings 使用 `settings.css` 与为保持原位置而晚加载的 `settings-page.css`。未来定位样式时必须同时检查同一 feature 的这些文件，而不能假定所有规则都在单一 CSS 文件中。

## 响应式 collision 审计

`src/styles/responsive-overrides.css` 与 `src/styles/responsive-overrides-late.css` 是小型兼容层，不是新样式归属地。壳层底栏、首页日程与日历网格的 760px 规则已归回 `app-shell.css`、`task-dashboard.css`、`calendar.css`、`projects.css`。overrides 仅保留 History/Review/Stats 未接入页、待安排队列、收尾对话框等跨 owner 覆盖；late 层保留手机表单最小 16px 的跨功能字号保护。

禁止把新的 feature 响应式规则直接加进 overrides。将规则归位前仍须确认 selector 与后续 owner 不竞争同一属性。

## CSS custom property 合同

`pnpm test:css-tokens` 使用 PostCSS 解析 `src/` 下的全部 CSS declaration，而不是用全文件正则；每个无 fallback 的 `var(--token)` 都必须能在任意已加载的 CSS declaration 中找到定义。带 fallback 的引用允许在某个主题或组件未定义 token 时降级。

仅由 React inline style 在运行时注入、因而不会出现在 CSS declaration 中的 property 可以写入 `tests/css-token-contract.test.ts` 的 `runtimeCustomProperties`。新增白名单时必须在该集合的 JSDoc 中说明注入位置和原因，不能为了绕过遗漏的 token 定义而加入白名单。

## 无障碍 smoke baseline

`e2e/ui-accessibility.spec.ts` 在 local test adapter 中扫描 Workspace、Calendar、Projects、Settings 与任务编辑 Dialog 的 axe critical/serious 结果。现有产品债务按 surface、rule id 和节点数写入 `knownBlockingAxeBaseline`：新增 rule、节点数增加、或修复后未同步下调 baseline 都会失败。不得通过 `disableRules` 关闭这些规则；修复产品样式或 Calendar ARIA 结构时，应先让测试展示实际结果，再下调相应 baseline。

当前基线来自本次 local adapter 审计：Workspace 为 `color-contrast: 2`；Calendar 为 `aria-required-children: 1`、`aria-required-parent: 42`、`color-contrast: 15`；Projects 为 `color-contrast: 16`；Settings 为 `color-contrast: 2`；任务编辑 Dialog 为 `color-contrast: 3`。这些是现有产品样式和 Calendar ARIA 结构债务；本次“测试覆盖加固”明确不改产品 UI/语义，因此只把它们转换成可见、可收紧的回归合同。

## 当前独立维护项

- History、Review、Stats 的代码和样式只维持可构建性，不删除、不重新接入。
