<!-- 文件用途：说明 Threadline 的分层测试门禁、隔离边界、覆盖率范围与 release-tier 验证决策。 -->

# 测试架构

## 习惯 V1

`tests/habit-rules.test.ts` 覆盖跨午夜、04:00、DST、历史目标、缺失分母与平均值；`habit-local-repository.test.ts` 覆盖事务、精度、冲突及恢复；`habit-state.test.tsx` 覆盖首次反馈、稳定重试、陈旧读取、离线和账号离开；`habit-repository.test.ts` 验证云读取分页、账号过滤和 RPC 参数。纯规则与两个仓储均纳入业务 coverage gate。

`e2e/habits.spec.ts` 在桌面、手机和 iPhone WebKit 验证直接导航、三项记录、历史补录、独立分界、刷新恢复及 axe。`supabase/tests/habits.test.sql` 为后续数据库环境保留 pgTAP 契约；本次用户明确跳过本地数据库启动与验证，SQL 静态检查不能被写作数据库实测通过。

`ui-habits.spec.ts` 只在布局项目中执行，检查四主题明暗切换、输入字号、焦点和横向溢出。使用固定时钟推进主题刷新，不等待无限装饰动画；Safari 焦点恢复通过键盘打开弹窗验证。`test-packaged-electron.mjs` 在隔离适配器分支验证习惯页动态 chunk、打卡刷新和工作站切换，真实云登录分支不写数据。当前实际结果与未测范围见 [习惯验收记录](habits.md#本次验收记录)。

Threadline 的测试目标是阻止功能、云端边界、桌面壳和明显布局回归，同时不把尚未定稿的视觉设计冻结成 screenshot baseline。本文件描述每层负责什么；同一行为不应为了提高测试数量而在所有层重复。

## 分层与命令

| 层                     | 命令                          | 负责的风险                                                                                              |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Unit / component       | `pnpm test`                   | 纯规则、mapper、状态和局部组件行为。                                                                    |
| Coverage gate          | `pnpm test:coverage`          | 显式高风险业务模块的新代码没有进入单测覆盖。                                                            |
| CSS token contract     | `pnpm test:css-tokens`        | 无 fallback 的 CSS custom property 引用缺失定义。                                                       |
| Web adapter E2E        | `pnpm test:e2e`               | 确定性的任务、Daily、PWA 与 Web 行为。                                                                  |
| Hosted Preview demo    | `pnpm test:preview`           | 无云 Vercel Preview 自动进入工作台，Daily/任务交互、刷新保存、独立存储及无 Supabase 请求。              |
| UI invariants          | `pnpm test:e2e:ui`            | 全局横向溢出、重复主结构、关键控件、Dialog/Popover 边界、Chrome viewport matrix 与 iPhone WebKit 回归。 |
| Local Supabase browser | `pnpm test:supabase:browser`  | Browser → Auth → CloudRuntimeProvider → RLS database → workspace → UI 的真实链路。                      |
| Electron behavior      | `pnpm test:electron`          | 开发壳的窗口切换、单实例和确定退出。                                                                    |
| Packaged Electron      | `pnpm test:electron:packaged` | 通过 Renderer CDP 验证 `win-unpacked` EXE 的 protocol、CSP、Preload、实际 Windows 图标与退出。          |
| Desktop parity         | `pnpm desktop:verify:parity`  | Preview 与 canonical package-dir 的静态 runtime 合同。                                                  |

`test:e2e` 只让既有功能用例运行一次 desktop 和一次 mobile；布局矩阵的 8 个 Chrome viewport（含 320/375/390/430px 手机宽度）与一条 `iPhone 13` device preset/WebKit 回归只收集 `ui-layout-matrix.spec.ts`。因此不会把整套业务流乘以所有尺寸。

`test:preview` 使用独立配置，关闭 test adapter 并以 `VERCEL_ENV=preview`、空 URL/key 构建真实演示。它只在桌面、320px 手机和 iPhone WebKit 各跑演示编辑和每日收尾两条流程，覆盖最新草稿保存屏障与失败阻止收尾，不启动 Supabase/Docker。设置 `THREADLINE_PREVIEW_URL` 后可通过 `pnpm exec playwright test --config playwright.preview.config.ts` 对已部署页面复用同一验收；每个用例使用全新浏览器上下文，不修改其他访问者的演示数据。

## UI 与无障碍边界

UI structural tests 只断言可观察的结构契约，例如主要面板唯一、当前导航唯一、关键控件可见、root 无横向溢出、稳定区域不相互覆盖、Dialog/Popover 未离开 viewport。管理 Dialog 额外验证焦点进入、Tab 留在 Dialog、Escape 关闭并把焦点还给触发按钮。它们不锁字体、颜色、像素间距、圆角、阴影或 screenshot。

Accessibility smoke 使用 axe 扫描 Workspace、Calendar、Projects、Settings 和任务编辑 Dialog，仅审计 `critical` 与 `serious`。当前已知债务以 rule/node 数量写入 `knownBlockingAxeBaseline`，扫描不会关闭任何 axe rule；新增 rule、节点数增加或产品修复后未收紧 baseline 都会失败。详细当前数量和收紧规则见 [前端样式归属](frontend-style-ownership.md)。

## Coverage gate

V8 覆盖率只纳入会改变业务数据或云端边界的模块：Daily 规则、task workflow、task create/edit、关账与 dashboard 聚合、按日耗时、analytics、task/project/date/repository 规则，以及 Supabase config、time mapper 和 workspace repository。页面展示、响应式 CSS 和真实 Cloud provider 的端到端交互由 Playwright 覆盖，避免用无价值 DOM/className 单测抬高数字。

初始门槛是根据当前明确纳入范围的实测值设置，而不是只统计被意外 import 的模块：statements `50%`、branches `50%`、functions `40%`、lines `55%`。门槛应随高风险模块测试增加而上调；不要通过缩小 include 或移除测试来让 CI 变绿。

## Supabase 隔离

`test:supabase:browser` 只接受 Supabase CLI status 返回的 loopback HTTP API。runner 使用本地 `SECRET_KEY` 预建已确认的一次性用户，浏览器只得到 publishable key、Email 与 password。测试结束时删除用户并回收自己的 Next server；它不能连接 Production Supabase，也不读取或写入部署 secret。

## CI 与 release tier

Web CI 失败时上传 `web-test-results`，保留七天，包含 Playwright trace、失败截图和错误上下文。交互用例还附带隔离 local adapter 的任务、项目及页面日期，用于区分刷新丢失、日期变化和页面未就绪；不采集生产账号数据。WebKit 项目刷新回归在完整矩阵前重复执行，优先定位该跨平台故障。

local adapter 的首开与交互回归刷新统一等待 `.dashboard` 就绪，上限 10 秒；页面 `load` 不代表 React 已读取本地数据。项目归属仍在刷新前校验存储身份，刷新后保留原业务按钮断言，不依靠固定 sleep、全局延长断言或自动重试。Linux WebKit 的故障 trace 曾显示 `load` 后超过 5 秒仍在载入，而随后任务与 `course` 归属均正确恢复，因此启动等待与保存验证必须分开。

PR CI 分为 `supabase`、`web`、`windows-electron` 三个 job。`supabase` 先启动 local Supabase，再运行数据库、Node integration 和真实 Chromium browser integration；`web` 执行 lint、typecheck、coverage、Web build 与 adapter E2E；`windows-electron` 顺序执行开发壳行为、package-dir 和 packaged EXE smoke。

`desktop:verify:parity` 会构建 Preview 和 canonical package-dir 两份 unpacked app，成本不适合常规 PR，因此只在 tag/manual release workflow 的发布前 job 执行，并使用隔离 local adapter。NSIS 安装/卸载没有可靠、独立的 CI harness；它保持 release-tier 人工验收，不能被误写为 PR gate 已覆盖。

## Issue 49 回归

`issue-49-*` 测试覆盖分页、账号批注、输入、命令和真实时区 Provider；原审计断言改为正确行为断言。`supabase/tests/issue_49.test.sql` 检查冲突、RLS、账本及事务回滚。真实 Service Worker 测试运行同源两版资源；Electron smoke 使用受控 Edge 加载闸门覆盖登录竞态。实机输入法与 iPhone 验收单列，不以合成事件或 WebKit 代替。最终证据记录于 [逐项矩阵](issue-49-regressions.md)。
