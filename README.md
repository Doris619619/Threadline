# Threadline

面向桌面浏览器与 iPhone PWA 的个人任务工作台。界面以“今日执行”为中心：普通任务、Daily、待安排、项目、收尾、历史和复盘在同一工作区中协作。

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
pnpm dev
```

访问 `http://localhost:3000`。未提供 Supabase 环境变量时，界面使用本地 seed 数据；UI 的持久化读写通过 `PersistentStateRepository` 端口进入浏览器存储，因此替换为远端实现时不需要改动业务组件。

## Windows 桌面版

桌面版使用 Tauri 2，复用同一套 Next.js 前端。需要 Node.js 22+、pnpm 11+、Rust stable（MSVC 工具链）、Visual Studio C++ Build Tools、Windows SDK 和 WebView2 Runtime。

```bash
pnpm desktop:dev
pnpm desktop:build
```

`desktop:dev` 会自行探测 MSVC、启动 Next.js 开发服务器并打开 Threadline 窗口。`desktop:build` 仅在 Tauri 构建过程中启用 Next.js static export，产物位于 `src-tauri/target/release/bundle/`；原有的 `pnpm build` 与 `pnpm start` 仍保持 Next.js Web/PWA 生产模式。

## Supabase

将 `.env.local` 中的以下变量填入对应项目的公开 URL 与 anon key：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

执行 `supabase/migrations/202608230001_initial_threadline.sql` 创建数据表。迁移包含 `owner_id`、约束、索引与基于 `auth.uid()` 的 RLS policy；客户端不能读取或修改其他用户的数据。

`src/lib/supabase-workspace-repository.ts` 已将 Project、Task、Daily、历史和收尾记录逐表映射到该 schema。配置完成并建立登录态后，可用该 Repository 替换本地实现；业务组件不直接依赖 Supabase SDK。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm playwright test
```

Playwright 会以生产构建启动本地服务并覆盖桌面与手机的关键流：新建/编辑任务、时间输入和自动时长、实际耗时、完成状态、Daily 父子联动、待安排、移期与放弃、回收站恢复、今日收尾、周月复盘。

## 项目结构

```text
src/app/                 App Router 页面、全局样式与元数据
src/components/          壳层与通用 UI 原子组件
src/features/            任务、Daily、项目、历史、复盘等业务视图
src/lib/                 规则、Zod schema、仓储接口与 seed
src/types/               领域类型
supabase/migrations/     PostgreSQL schema 与 RLS
e2e/                     Playwright 端到端测试
tests/                   Vitest 单元测试
public/                  Manifest、图标与 Service Worker
```

## 数据与交互约定

- 普通任务只有“重要 / 不重要”两档待安排优先级。
- 删除进入回收站，恢复后回到当天；放弃、待安排、移期保留为可复盘历史。
- Daily 的子任务完成会同步父任务完成状态；Daily 实际耗时计入首页与复盘统计，但不会作为普通任务顺延。
- 开始与结束时间支持 `1420` / `14:20` 输入；同日填写会自动计算预计分钟，不支持跨午夜。
