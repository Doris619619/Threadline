<!-- 文件用途：定义 Threadline 前端样式与任务工作台模块的归属边界，并记录重构期间必须保持的兼容性约束。 -->

# 前端样式与模块归属

## CSS 入口与顺序

`src/app/globals.css` 是唯一的全局样式入口。它只负责 Tailwind 与有序 `@import`，不得新增业务 selector。

当前拆分严格保持旧 `globals.css` 的区块顺序：token、基础规则、UI primitive、Electron 窗口、紧凑任务、应用壳、任务、Daily、项目、复盘、统计/设置、历史、前置兼容响应式、跨功能页面规则、后置兼容响应式、Insights 打印。`insights-print.css` 必须始终最后加载。

## Owner 规则

- `src/styles/tokens.css`：仅 CSS custom properties，包括色板、字号阶梯（page/section/card/body/secondary/label/caption）、圆角、间距、阴影、触控尺寸与运动时长。
- `src/styles/base.css`：reset、文档根节点、全局 focus、reduced motion 与跨 feature 的 `.empty-copy`。
- `src/components/ui/ui.css`：只服务于 `components/ui` 输出的 `.tl-*` primitive，不放页面布局。`Surface` 提供 `raised` / `flat` 两档。
- `src/components/app-shell.css`：Web/PWA 导航、主内容区、日期栏、账户 disclosure 与 **760px 底栏导航**；disclosure 使用普通 button/popover 语义，不添加 `role="menu"`。
- `src/styles/desktop-window.css`：Electron Full、Compact、Edge 与 `-webkit-app-region`；Full 使用纵向 flex，避免 Web 无标题栏时预留空行。窄屏将 `.tl-window-body` 改为单列，让固定底栏不占用侧栏网格。
- `src/features/tasks/task-dashboard.css`：首页仪表盘、今日日程七列网格、手机纵向任务行（同一 DOM，760px 切换 `grid-template-areas`）、无时间待办与首页胶囊统计。
- `src/features/feature-pages.css`：Calendar、Insights、Rhythm 共用的页面信息架构 selector；只有 selector 本身跨多个 feature 时才允许放入这里。
- `src/features/<feature>/`：该 feature 自己渲染的业务 selector 和已审计的响应式规则。

为严格保持历史 CSS rule order，少数 grouped selector 仍随其原始连续规则块落在最接近的 feature 文件中：例如 `calendar.css` 可包含 Rhythm selector，`insights.css` 可包含 Records 输入 selector。这是有意的兼容层设计，不代表 CSS ownership 漏分。

Insights 使用 `insights.css`（主页面）、`insights-report.css`（必须晚于 Rhythm 的报告基础规则）与始终最后加载的 `insights-print.css`；Settings 使用 `settings.css` 与为保持原位置而晚加载的 `settings-page.css`。未来定位样式时必须同时检查同一 feature 的这些文件，而不能假定所有规则都在单一 CSS 文件中。

## 响应式 collision 审计

`src/styles/responsive-overrides.css` 与 `src/styles/responsive-overrides-late.css` 是小型兼容层，不是新样式归属地。壳层底栏、首页日程与日历网格的 760px 规则已归回 `app-shell.css`、`task-dashboard.css`、`calendar.css`、`projects.css`。overrides 仅保留 History/Review/Stats 未接入页、待安排队列、收尾对话框等跨 owner 覆盖。

禁止把新的 feature 响应式规则直接加进 overrides。将规则归位前仍须确认 selector 与后续 owner 不竞争同一属性。

## 当前独立维护项

- History、Review、Stats 的代码和样式只维持可构建性，不删除、不重新接入。
