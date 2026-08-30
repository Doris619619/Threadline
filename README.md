<!-- 文件用途：介绍 Threadline 的产品定位、运行方式、桌面版构建、数据配置和仓库结构。 -->

# Threadline

面向桌面浏览器、iPhone PWA 与 Windows 桌面端的个人任务工作台。界面以“今日执行”为中心：普通任务、Daily、待安排、项目、收尾、日历、洞察和节律在同一工作区中协作。

## 产品与运行形态

- **Web / PWA**：Next.js App Router 应用，成功在线打开后预缓存应用壳与当前 Next 静态资源，支持断网重开。
- **Windows 桌面版**：Electron 打包同一套前端；不维护第二套 UI 或业务逻辑。
- **数据层**：Supabase 是任务、项目、Daily、历史、工作站与 Rhythm 的唯一业务真源；未配置时显示明确门禁，不回退本地业务数据。Annotation 笔迹、高亮颜色和窗口 UI 状态仍仅保存在设备上。

核心流程包括任务规划与执行、Daily 父子任务联动、待安排和移期、回收站恢复、每日收尾、项目投入日历，以及跨范围洞察与报告导出。

## 技术栈

- Next.js App Router、React 19、TypeScript（严格模式）
- Tailwind/PostCSS 基础设施与项目级 CSS design tokens
- Zod 输入验证、date-fns、TanStack Query、Supabase JS
- Vitest + Testing Library、Playwright（桌面 Chrome 与 iPhone 13）
- Web Manifest 与 Service Worker 离线应用壳缓存

## 本地启动

需要 Node.js 22+ 与 pnpm 11+。

```bash
pnpm install
Copy-Item .env.example .env.local
# 填写 Supabase URL、sb_publishable_ key 与 cloud environment
pnpm dev
```

访问 `http://localhost:3000`。未提供 Supabase 环境变量时只显示“尚未配置云工作区”，不会读取旧业务 localStorage。首次登录会原子创建“工作 / 课程 / AI研究 / 生活 / 其他”五个 UUID 项目，不创建 demo task、Daily 或 history。Playwright/Electron 的本地 seed 仅由测试脚本显式构建 `NEXT_PUBLIC_THREADLINE_TEST_ADAPTER=true`，Vercel 会拒绝该标记。

常用质量检查：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:sql:static
pnpm build
pnpm test:e2e
```

## Windows 桌面版

桌面版使用 Electron 44，复用同一套 Next.js 前端。需要 Node.js `>=22.12.0` 与 pnpm `11.19.0`；不需要 Rust 或 WebView2 工具链。

```bash
pnpm desktop:dev
pnpm desktop:compile
pnpm desktop:renderer
pnpm desktop:preview
pnpm desktop:preview:open
pnpm desktop:verify:parity
pnpm desktop:build:dir
pnpm desktop:build
pnpm desktop:release
```

`desktop:compile` 会先检查 Electron 类型，再以 `esbuild` 将 Main 与 Preload 输出为 `dist-electron/*.cjs`；两者保持 CommonJS。洞察报告在 Web/PWA 走浏览器打印，在 Electron 通过受限 Main bridge 保存为 PDF。`desktop:dev` 会启动隔离的 Next.js 开发服务器并打开 Electron 窗口。`desktop:renderer` 只生成 `.next-electron` 静态前端；正式 Preview/package/release 会在构建期强制校验 Production Supabase 的 HTTPS URL、`sb_publishable_` key 与环境标记。

日常需要“最新 EXE”时使用 `desktop:preview`：它生成 `release/preview/win-unpacked/Threadline.exe`，仍走正式 Renderer、Main/Preload、electron-builder、ASAR、afterPack 与 fuses，只省略 NSIS。`desktop:preview:open` 会在成功后显式启动；`desktop:verify:parity` 会与 canonical package-dir 比较 ASAR、运行文件树、fuse wire 与 manifest 等静态合同，不为自动化测试改动正式 runtime。`desktop:build:dir` 保留为 CI/兼容目录包入口；`desktop:build` 生成仅供验证、明确不发布的 NSIS 安装包；仅版本 tag 或手动触发的 GitHub Release workflow 使用 `desktop:release` 发布。原有的 `pnpm build` 与 `pnpm start` 仍保持 Next.js Web/PWA 生产模式。

Web/PWA 使用请求期 nonce CSP，Electron 静态导出继续从实际 HTML 生成精确 script hash；两条构建链使用独立路由入口与输出目录。Windows 包在 `afterPack` 写入并复核 Electron fuses、ASAR integrity 与 `OnlyLoadAppFromAsar`。完整命令、manifest、并发保护、production parity 与 Defender `PACKAGING_STALL` 诊断见 [Windows 本地构建](docs/WINDOWS_BUILD.md)；安全边界见 [CSP 与打包硬化](docs/electron-hardening.md)。

Windows 普通用户优先使用构建生成的 NSIS 安装器：

```text
release/Threadline_<version>_x64-setup.exe
```

该文件适合上传到 GitHub Releases；`release/preview/win-unpacked/Threadline.exe` 是日常验收入口，`release/win-unpacked/Threadline.exe` 是 canonical package-dir/CI 产物，均不作为默认下载项。构建产物已被 Git 忽略，不会随源码提交。Windows 进程、快捷方式、Main/Edge 窗口统一使用 `com.doris619619.threadline` 的 AppUserModelID，以保持任务栏分组和单实例激活一致。

## Supabase

将 `.env.local` 中的以下变量填入对应项目的公开 URL 与 publishable key：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_THREADLINE_CLOUD_ENV=production
```

本地联调可使用 `supabase status` 返回的 `http://127.0.0.1:54321` 与 `PUBLISHABLE_KEY`，并把 cloud environment 设为 `test`；loopback HTTP 例外不会进入 Vercel 或 Electron production 构建。

运行迁移和本地数据库测试：

```bash
pnpm supabase:start
pnpm supabase:lint
pnpm test:db
pnpm test:supabase:integration
```

迁移包含 UUID、same-owner FK、RLS、Daily 幂等实例化、正式 Daily History、原子任务流转/收尾/工作站排序、按日固定的 task actual entries、Realtime publication，以及受保护的 30 天物理 purge。客户端只使用 Email/password 与 publishable key；Main/Preload 不持有 Supabase secret。`test:supabase:integration` 会在本地创建并清理两个临时账号，真实验证 publishable-key Auth、REST/RLS、owner-filter Realtime、Rhythm 和 Daily 并发幂等。Docker 不可用时可先执行 `pnpm test:sql:static`，但不能把本地 SQL/pgTAP 标记为通过。持久化、Daily template 与实际耗时的行为边界见 [数据完整性规则](docs/data-integrity.md)。

远端 Supabase、Cron、Vercel Production/Preview 和真实手机验收步骤见 [Supabase、Vercel 与跨端验收](docs/supabase-deployment.md)。Supabase 后端配置完成不等于已有公网 HTTPS PWA URL；没有部署 URL 时，PC + 手机 hosted acceptance 必须保持 pending。

## 自动化验证范围

`pnpm test:e2e` 会以显式 local test adapter 生产构建启动本地服务，并覆盖桌面与手机关键流。该适配器只用于 UI/Electron 自动化，不代表 Supabase 集成通过；真实云端由 pgTAP/RLS、local Supabase integration、cross-account 与 Realtime 测试独立覆盖。

## 项目结构

```text
src/app/                 App Router 页面、全局样式与元数据
src/components/          壳层与通用 UI 原子组件
src/features/            任务、Daily、项目、日历、洞察、节律与领域状态视图
src/styles/              design token、基础规则、Electron 窗口与有序响应式覆盖
src/lib/                 规则、日期范围、analytics、Zod schema、仓储接口与 seed
src/types/               领域类型
supabase/migrations/     PostgreSQL schema 与 RLS
e2e/                     Playwright 端到端测试
tests/                   Vitest 单元测试
public/                  Manifest、图标与 Service Worker
electron/                Electron Main、Preload、protocol 与 Windows 打包资产
electron-builder.config.cjs Windows x64 NSIS 打包配置
docs/                    PRD、目标、工程协作规范、桌面交互与 PR 撰写规范
```

## 数据与交互约定

前端结构约定见 [前端样式与模块归属](docs/frontend-style-ownership.md)：`src/app/globals.css` 只保留 Tailwind 和有序 CSS 入口，任务首页由展示组件及 data/create/workflow/drag/resize 等职责 Hook 组成。桌面今日日程为七列网格，手机为同一数据源下的纵向任务列表。新增样式和任务交互前应先按该文档定位 owner，避免跨功能改动。

- 普通任务只有“重要 / 不重要”两档待安排优先级。
- 删除进入回收站，恢复后回到当天；放弃、待安排、移期保留为可复盘历史。
- Daily 日期实例独立保存 title/project/children/completed/actual/result snapshot，不污染未来模板；Records 只使用正式 `daily_history_entries`，而 Calendar/Insights/PDF 会把正式记录与尚未记录的日期实例按模板和日期去重合并。
- 日历、洞察与 PDF 共用纯函数 analytics 口径；旧收尾数据只能作为项目级 aggregate，绝不反推任务级历史。详细规则见 [工作台信息架构与分析口径](docs/workspace-information-architecture.md)。
- 开始与结束时间支持 `1420` / `14:20` 输入；同日填写会自动计算预计分钟，不支持跨午夜。
- **今日日程 ↔ 无时间待办**支持拖拽移动任务（不复制）：按住每条任务右侧的六点拖拽柄并拖到另一面板；拖入日程后会作为持久化的待填时间任务置顶并自动聚焦时间输入，拖出会清除待填状态与全部排程时间。
- **荧光笔 / 橡皮擦**可在今日日程区域批注，坐标按相对比例持久化；按 Esc 或再次点击工具退出。
- **节律**按账号同步；**批注**与高亮颜色保持设备本地。任务远端进入回收站或离线期间被永久 purge 后，设备会用 authoritative all-task identity 对账清除孤立笔迹。
- **Windows 桌面三态工作流**：仅 Electron 检测到受限 Main Renderer bridge 时，完整工作台才显示迷你今日、工作站、最小化、原生最大化/还原和关闭。Web/PWA 始终保持完整工作台，历史桌面偏好也不会制造无作用入口。两种紧凑视图使用同一个始终置顶的主窗口并可互转；右侧 edge tab 只是紧凑视图的收起状态，悬停后恢复最近视图；启动、模式切换和第二次启动都会校验多显示器/DPI 下的可见 geometry，并唤醒既有窗口。

## 协作约定

提交代码前请阅读 [工程协作规范](docs/%E5%B7%A5%E7%A8%8B%E5%8D%8F%E4%BD%9C%E8%A7%84%E8%8C%83.md)。它要求维护文件与函数说明、清晰拆分职责、按规定创建分支、同步维护 README/docs，并在每次修改完成后创建 Git commit。提交标题必须使用 `<type>(<scope>)：<summary>`，例如 `fix(cloud)：修正ROS2话题与驱动配置`。创建或更新 Pull Request 时，正文须按 [PR撰写规范](docs/PR撰写规范.md) 的 `Summary / 背景 / 改动（逻辑） / 改动（代码） / 影响 / 验证 / 材料` 结构书写。桌面拖拽、荧光笔与三态窗口的行为说明见 [桌面交互与窗口形态](docs/desktop-window-modes.md)。
