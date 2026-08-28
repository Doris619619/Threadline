<!-- 文件用途：定义 Threadline 前端样式与任务工作台模块的归属边界，并记录重构期间必须保持的兼容性约束。 -->

# 前端样式与模块归属

## CSS 入口与顺序

`src/app/globals.css` 是唯一的全局样式入口。它只负责 Tailwind 与有序 `@import`，不得新增业务 selector。

当前拆分严格保持旧 `globals.css` 的区块顺序：token、基础规则、UI primitive、Electron 窗口、紧凑任务、应用壳、任务、Daily、项目、复盘、统计/设置、历史、兼容响应式、Insights 打印。`insights-print.css` 必须始终最后加载。

## Owner 规则

- `src/styles/tokens.css`：仅 CSS custom properties。
- `src/styles/base.css`：reset、文档根节点、全局 focus 与 reduced motion。
- `src/components/ui/ui.css`：只服务于 `components/ui` 输出的 `.tl-*` primitive，不放页面布局。
- `src/components/app-shell.css`：Web/PWA 导航、主内容区、日期栏与移动导航。
- `src/styles/desktop-window.css`：Electron Full、Compact、Edge 与 `-webkit-app-region`。
- `src/features/<feature>/`：该 feature 自己渲染的业务 selector 和已审计的响应式规则。

## 响应式 collision 审计

`src/styles/responsive-overrides.css` 目前保留原文件第一个机械等价版本的响应式规则和工作台信息架构规则。它是过渡兼容层，不是新样式归属地。

将规则归位前必须确认：

1. selector 与后续 owner 不竞争同一属性，或移动后仍在被覆盖规则之前；
2. `@media` / `@print` 上下文不变；
3. Full、1050px、760px、iPhone、Insights print 的截图和 computed style 无意外差异。

无法安全重排的跨 owner 覆盖可保留在该文件，但必须在此文档补充 selector、覆盖对象和理由；禁止把新的 feature 响应式规则直接加进这里。

## 当前独立维护项

- `--accent-soft` 未定义、Calendar 状态 class 缺少空格、History/Review/Stats 未接入均为独立 issue，不属于本次结构重构。
- History、Review、Stats 的代码和样式本轮只维持可构建性，不删除、不重新接入。
