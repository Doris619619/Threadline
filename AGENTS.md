<!-- 文件用途：为在 Threadline 仓库中执行任务的人和自动化编码代理提供必须遵守的项目级指令。 -->

# Threadline 代理工作规则

## 项目说明

Threadline 是个人任务工作台，提供桌面浏览器、iPhone PWA 和 Windows 桌面应用三种使用方式。项目以同一套 Next.js App Router 前端承载 UI 与业务逻辑；Web/PWA 保持 Next.js 服务模式，Windows 端通过 Tauri 2 在构建时加载静态导出的前端。

- `src/app/`：App Router 页面、全局样式和元数据。
- `src/components/`：页面壳层与可复用 UI 组件。
- `src/features/`：任务、Daily、项目、历史和复盘等业务视图。
- `src/lib/` 与 `src/types/`：领域规则、数据仓储、schema 与类型。
- `supabase/migrations/`：数据库 schema、约束与 RLS。
- `src-tauri/`：Windows Tauri 2 壳层与打包配置。

修改时可以根据任务需要重写整套前端，包括为桌面端建立新的前端实现；重写前后都必须明确架构边界、同步维护 README/docs，并完成与影响范围相称的验证。涉及 Next.js 或 Tauri 行为时，应先查阅项目已安装版本的官方文档与当前实现。

## 强制工作规范

在创建、修改、删除或提交仓库文件前，必须完整阅读并严格遵守 [docs/工程协作规范.md](docs/%E5%B7%A5%E7%A8%8B%E5%8D%8F%E4%BD%9C%E8%A7%84%E8%8C%83.md)。其中的文件与函数说明、职责拆分、分支命名、README/docs 同步维护、提交规范及 Pull Request 正文要求，均为强制要求。代写或更新 PR 时，还必须遵守 [docs/PR撰写规范.md](docs/PR撰写规范.md) 中的结构与风格。
