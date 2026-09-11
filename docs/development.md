<!-- 文件用途：集中维护本地启动、桌面构建、云端配置和自动化验证的详细说明。 -->

# 开发与运行指南

[返回项目首页](../README.md)

## 技术栈

- Next.js App Router、React 19、TypeScript（严格模式）
- Tailwind/PostCSS 基础设施与项目级 CSS design tokens
- Zod 输入验证、date-fns、TanStack Query、Supabase JS
- Vitest + Testing Library、Playwright + axe（桌面 Chrome 与 iPhone 13）
- Web Manifest 与 Service Worker 离线应用壳缓存

## 本地启动

需要 Node.js 22+ 与 pnpm 11+。

```bash
pnpm install
Copy-Item .env.example .env.local
# 填写 Supabase URL、sb_publishable_ key 与 cloud environment
pnpm dev
```

访问 `http://localhost:3000`。普通本地/云运行时未提供 Supabase 环境变量时显示“尚未配置云工作区”，不会读取旧业务 localStorage。首次登录会原子创建“工作 / 课程 / AI研究 / 生活 / 其他”五个 UUID 项目，不创建 demo task、Daily 或 history。

**PR 在线预览**：Vercel Preview 没有配置 Supabase URL/key 时自动进入演示模式，手机或电脑打开 PR 的 Preview 链接即可操作今日任务、重要/普通待安排和 Daily，无需登录或新增 Supabase 项目。演示数据为虚构样例，使用独立浏览器存储；刷新保留操作，换设备、浏览器或部署域名不会同步。优先使用 PR 的固定分支预览链接，单次部署链接仍指向旧版本。配置了 staging/test Supabase 的 Preview 继续走真实云登录；Production 必须使用正式云配置。Playwright/Electron 仍使用显式 `NEXT_PUBLIC_THREADLINE_TEST_ADAPTER=true`，该测试标记禁止部署到 Vercel。

执行 `pnpm test:preview` 可构建与 Vercel 相同的无云演示并验证桌面、320px 手机和 iPhone WebKit 的真实交互，不需要 Docker。演示模式不是跨设备同步或数据库验收。

如果手机打开预览后显示“Log in to Vercel”，这是 Vercel 项目的 Deployment Protection，与 Threadline 登录无关。需要免登录分享时，在项目 Settings → Deployment Protection → Vercel Authentication 关闭 Require Log In 并保存；这是项目级访问设置，应由项目所有者确认。详细范围见[部署说明](supabase-deployment.md#vercel-环境变量)。

常用质量检查：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:sql:static
pnpm test:css-tokens
pnpm build
pnpm test:e2e
pnpm test:e2e:ui
```

## Windows 桌面版

桌面版使用 Electron 44，复用同一套 Next.js 前端。需要 Node.js `>=22.12.0` 与 pnpm `11.19.0`；不需要 Rust 或 WebView2 工具链。

```bash
pnpm desktop:dev
pnpm desktop:compile
pnpm desktop:renderer
pnpm test:electron
pnpm desktop:preview
pnpm desktop:preview:open
pnpm desktop:verify:parity
pnpm desktop:build:dir
pnpm test:electron:packaged
pnpm desktop:build
pnpm desktop:release
```

`desktop:compile` 会先检查 Electron 类型，再以 `esbuild` 将 Main 与 Preload 输出为 `dist-electron/*.cjs`；两者保持 CommonJS。洞察报告在 Web/PWA 走浏览器打印，在 Electron 通过受限 Main bridge 保存为 PDF。`desktop:dev` 会启动隔离的 Next.js 开发服务器并打开 Electron 窗口。`desktop:renderer` 只生成 `.next-electron` 静态前端；正式 Preview/package/release 会在构建期强制校验 Production Supabase 的 HTTPS URL、`sb_publishable_` key 与环境标记。

日常需要“最新 EXE”时使用 `desktop:preview`：它生成 `release/preview/win-unpacked/Threadline.exe`，仍走正式 Renderer、Main/Preload、electron-builder、ASAR、afterPack 与 fuses，只省略 NSIS。`desktop:preview:open` 会在成功后显式启动；`desktop:verify:parity` 会与 canonical package-dir 比较 ASAR、运行文件树、fuse wire 与 manifest 等静态合同，不为自动化测试改动正式 runtime。`desktop:build:dir` 保留为 CI/兼容目录包入口，随后可执行 `test:electron:packaged`：它默认启动 `release/win-unpacked/Threadline.exe`，通过 Chromium CDP 验证 `threadline://app`、CSP、非 dev-server 加载、受限 Preload 驱动的窗口切换、单实例与退出。正式 fuses 会关闭 Node CLI inspect，因此 packaged smoke 不通过放宽 fuse 来连接 Main。`desktop:build` 生成仅供验证、明确不发布的 NSIS 安装包；仅版本 tag 或手动触发的 GitHub Release workflow 会先运行静态 parity，再使用 `desktop:release` 发布。原有的 `pnpm build` 与 `pnpm start` 仍保持 Next.js Web/PWA 生产模式。

Web/PWA 使用请求期 nonce CSP，Electron 静态导出继续从实际 HTML 生成精确 script hash；两条构建链使用独立路由入口与输出目录。Windows 包在 `afterPack` 写入并复核 Electron fuses、ASAR integrity 与 `OnlyLoadAppFromAsar`。完整命令、manifest、并发保护、production parity 与 Defender `PACKAGING_STALL` 诊断见 [Windows 本地构建](WINDOWS_BUILD.md)；安全边界见 [CSP 与打包硬化](electron-hardening.md)。

Windows 普通用户优先使用构建生成的 NSIS 安装器：

安装版支持「设置 → 关于 Threadline」手动检查，启动 30 秒后及每 6 小时自动检查；回到主窗口或休眠恢复时，间隔至少一小时也会补查。发现新版时在标题栏显示小型更新入口，仅点击时展开详情；下载完成不会自动弹窗，由用户确认重启，不会自动下载或在普通退出时安装。旧版需手动安装一次带此功能的新版本。从 0.1.2 起，源码、安装包和更新文件统一放在公开的 `Doris619619/Threadline` 仓库，旧 0.1.1 需手动安装一次 0.1.2 以切换更新源；发布配置与验证边界见 [Windows 自动更新](desktop-auto-update.md)。

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
pnpm exec playwright install chromium
pnpm test:supabase:browser
```

迁移包含 UUID、same-owner FK、RLS、Daily 幂等实例化、正式 Daily History、原子任务流转/收尾/工作站排序、客户端只读且按日固定的 task actual entries、数据库重算的关账项目汇总、Realtime publication，以及保留耗时历史的 30 天 task 物理 purge。客户端只使用 Email/password 与 publishable key；Main/Preload 不持有 Supabase secret。`test:supabase:integration` 会在本地创建并清理两个临时账号，真实验证 publishable-key Auth、REST/RLS、owner-filter Realtime、Rhythm 和 Daily 并发幂等。`test:supabase:browser` 只接受 local Supabase loopback URL，以 CLI 本地 `SECRET_KEY` 创建并在 finally 删除一次性已确认账户；浏览器本身只使用公开 key 和临时 Email/password，完整走登录、工作区初始化、创建任务、刷新持久化与登出。Docker 不可用时可先执行 `pnpm test:sql:static`，但不能把本地 SQL/pgTAP 标记为通过。持久化、Daily template 与实际耗时的行为边界见 [数据完整性规则](data-integrity.md)。

远端 Supabase、Cron、Vercel Production/Preview 和真实手机验收步骤见 [Supabase、Vercel 与跨端验收](supabase-deployment.md)。Supabase 后端配置完成不等于已有公网 HTTPS PWA URL；没有部署 URL 时，PC + 手机 hosted acceptance 必须保持 pending。

## 自动化验证范围

`pnpm test:e2e` 会以显式 local test adapter 生产构建启动本地服务，并覆盖既有桌面与手机关键流，以及结构、布局和无障碍 smoke。`pnpm test:e2e:ui` 只运行不依赖 screenshot baseline 的 UI 门禁：主要工作区的标题、导航、主面板与关键控件结构合同；颜色 popover、任务编辑和管理 Dialog 的 viewport/focus 边界；四种桌面与 320/375/390/430px 四种 Chrome 移动 viewport 的横向溢出、关键元素可达性和移动端控件隐藏，并额外使用 `iPhone 13` device preset 的 WebKit 回归移动端新增任务；以及关键页面和编辑 Dialog 的 axe critical/serious 回归。当前产品已有的 axe 债务会以每个页面的 rule/node 数量显式记录；新增 rule、节点数量增长或产品修复后没有下调 baseline 都会失败，避免通过关闭 rule 掩盖问题。`pnpm test:coverage` 对显式高风险业务模块执行 V8 coverage gate；`pnpm test:css-tokens` 用 PostCSS 静态校验 `src/` 下所有 CSS custom property 引用必须有定义、fallback 或已记录的运行时来源（当前仅 React inline style 注入的 `--annotation-color`）。Windows PR CI 还会先运行 `pnpm test:electron` 的开发壳行为流，再以同一隔离 adapter 打包 canonical EXE 并运行 `pnpm test:electron:packaged`；packaged runner 不启动 Next server，只通过 Renderer CDP 验证不依赖 Node inspector 的生产合同，并清理本轮拥有的 Electron 进程树。该适配器只用于 UI/Electron 自动化，不代表 Supabase 集成通过；真实云端由 pgTAP/RLS、local Supabase integration、cross-account 与 Realtime 测试独立覆盖。分层、门槛与 release-tier 边界见 [测试架构](testing-architecture.md)。

## 项目结构

```text
src/app/                 App Router 页面、全局样式与元数据
src/components/          壳层与通用 UI 原子组件
src/features/            任务、Daily、项目、规划、洞察、节律与领域状态视图
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

## 协作约定

提交代码前请阅读 [工程协作规范](%E5%B7%A5%E7%A8%8B%E5%8D%8F%E4%BD%9C%E8%A7%84%E8%8C%83.md)。它要求维护文件与函数说明、清晰拆分职责、按规定创建分支、同步维护 README/docs，并在每次修改完成后创建 Git commit。提交标题必须使用 `<type>(<scope>)：<summary>`，例如 `fix(cloud)：修正ROS2话题与驱动配置`。创建或更新 Pull Request 时，正文须按 [PR撰写规范](PR撰写规范.md) 的 `Summary / 背景 / 改动（逻辑） / 改动（代码） / 影响 / 验证 / 材料` 结构书写。桌面拖拽、荧光笔与三态窗口的行为说明见 [桌面交互与窗口形态](desktop-window-modes.md)。
