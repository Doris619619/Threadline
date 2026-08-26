<!-- 文件用途：作为 Threadline 从 Tauri 2 迁移到 Electron 的正式实施计划、阶段状态与偏差记录。 -->

# Threadline Tauri 2 → Electron Windows 桌面壳迁移计划

## 文档状态与执行规则

- 总体状态：已批准，Phase 0 尚未开始。
- 基线：`origin/main@471f910fe4482cf9cecddf8d95262c340e8ef075`。
- 迁移分支：`refactor/20260826-electron-desktop-shell`。
- 目标平台：Windows x64；Web/PWA 保持 Next.js 服务模式。
- 数据库、Supabase schema、RLS 和领域模型不在本次迁移范围内。
- 固定工具链：Node.js `>=22.12.0`、pnpm `11.19.0`、Electron `44.0.0`、electron-builder `26.15.3`。

本文件是迁移的唯一 living document。每个 Phase 开始时标记为 `In Progress`；完成时必须在该 Phase 的最终 commit 中同步状态、实际验证命令及结果、commit 和 deviations。没有偏差时明确记录 `None`。长期记录只保留可在干净环境复现的工程问题，不记录本机 PID、瞬时端口占用、缓存路径或临时日志。

| 阶段          | 状态        | Commit                                                                                          | 验证结果                                                                                                                                                                  | Deviations                                                                                                             |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Plan baseline | Done        | `docs(desktop)：记录 Electron 迁移实施计划与阶段状态`                                           | 审核通过                                                                                                                                                                  | None                                                                                                                   |
| Phase 0       | Done        | `chore(build)：建立 hoisted 依赖布局与可复现测试基线`                                           | pnpm 11.19.0、hoisted linker、frozen install、Next 解析、lint、typecheck、11 个 unit tests 与 Web build 通过；隔离 E2E 为 31 passed / 18 failed / 3 skipped               | 隔离 E2E 暴露既有任务/Daily 创建与持久化失败，Phase 9 前须修复；全局 Prettier 存在 39 个既有格式问题，改动文件单独检查 |
| Phase 1       | Done        | `refactor(desktop)：提取跨壳窗口状态与几何策略`                                                 | typecheck 通过；desktop policy tests 13 passed；变更文件 Prettier 与 diff check 通过                                                                                      | None                                                                                                                   |
| Phase 2       | Done        | `feat(electron)：建立待二进制验收的桌面壳骨架`、`fix(electron)：完成官方 artifact 下载安装验收` | hoisted linker、Electron `v44.0.0`、builder `26.15.3`、frozen install、Main/Preload 编译、静态 renderer export、`desktop:dev`、`desktop:build:dir` 和 unpacked 启动均通过 | 官方 artifact 初始网络超时后，仅在当前下载流程临时经 `127.0.0.1:7890` 代理完成官方校验下载；未写入永久配置             |
| Phase 3       | Done        | `feat(desktop)：实现角色隔离与窗口启动 hydration 握手`                                          | lint、typecheck、13 个 unit tests、Main/Preload compile、Web build、desktop renderer export 与开发壳 handshake 均通过                                                     | None                                                                                                                   |
| Phase 4       | Done        | `refactor(desktop)：统一原生窗口状态权威与几何回传`                                             | lint、typecheck、13 个 unit tests、Main/Preload compile 通过                                                                                                              | None                                                                                                                   |
| Phase 5       | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |
| Phase 6       | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |
| Phase 7       | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |
| Phase 8       | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |
| Phase 9       | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |
| Phase 10      | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |
| Phase 11      | Not Started | —                                                                                               | —                                                                                                                                                                         | —                                                                                                                      |

## 不可变架构决策

### 窗口模型

- Full、Mini Today、Workstation 共用带 Windows 原生边框的 Main `BrowserWindow`；Edge 使用独立、无边框、固定尺寸的 Edge `BrowserWindow`。
- 逻辑尺寸保持为 Full `1280 × 840`、Mini Today `420 × 660`、Workstation `300 × 420`、Edge `42 × 146`。
- Main/Edge 切换总是先显示目标、再隐藏源窗口。用户关闭 Main 即退出；不引入托盘常驻或无窗口后台模式。

### 状态权威边界

- Renderer 是业务 view、presentation、`lastCompactMode`、期望 geometry 和所有 persisted business state 的唯一 source of truth。
- Main 是 BrowserWindow 真实 bounds、可见性、焦点、显示器和原生回退结果的唯一 source of truth；只缓存最近一次通过校验的 Renderer 状态用于本进程恢复，不持久化业务状态。
- 请求带单调递增 `requestId`，Main 忽略过期请求并在程序化 `setBounds` 时抑制 geometry 回传。仅用户实际拖动/缩放产生 `origin: "user"` 事件；Renderer 保存 canonical geometry 但不得由保存动作再次触发 transition。

### 启动 handshake 与可见性

1. Main 创建 `BrowserWindow({ show: false })`，注册 load、crash、closed 和 8 秒 watchdog。
2. Renderer 完成业务 Provider 内的 desktop state hydration 后，仅调用一次 `hydrateDesktopState(payload)`。
3. Main 校验 payload、解析显示器、应用真实 native state，并同时等待 handshake 与 `ready-to-show`。
4. 两者完成前不允许 `show()`；Full/Mini/Workstation 显示 Main，Edge 先创建并显示 Edge 后继续隐藏 Main。
5. Main 返回 `NativeApplyResult` 后 Renderer 才进入 ready；无效 payload 或超时显示安全 Full。

正常启动不得先显示默认 Full 再切换。应用进入 `running` 后始终至少有一个 Main/Edge 可见；若无法创建 Main，则显示原生错误并退出，而不是留下无窗口后台进程。

### Edge 角色与故障恢复

- `ThreadlineRoot` 必须在任何业务 Provider 前同步读取 `window.threadlineDesktop?.role`。
- `edge-tab` 只渲染 `DesktopEdgeSurface`，不得挂载 `TaskDashboard`、`WorkspaceRepository`、Supabase、React Query、业务订阅或完整 `DesktopWindowProvider`。
- Main 集中维护 `ensureVisibleSurface(reason)`。Edge 构造/加载失败、`did-fail-load`、`render-process-gone`、`unresponsive`、非主动 `closed`、显示器变化、定位失败或 reveal 超时，都恢复 Main 到 `lastCompactMode + expanded`；无有效 compact mode 时回退 Full。
- 每次故障恢复先安全显示 Main，再销毁 Edge；rollback 必须通知 Renderer 将 persisted presentation 修正为 `expanded`。

### Windows 身份、安全与打包

- `AppUserModelID` 和 electron-builder `appId` 固定为 `com.doris619619.threadline`；产品名为 `Threadline`。
- 在首个 BrowserWindow 前调用 `app.setAppUserModelId(...)`。Main 和 Edge 都使用 Threadline 图标并设置 `skipTaskbar: false`，通过同一身份归入一个任务栏组。
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。Preload 只暴露经过类型和 runtime schema 校验的窄接口；不暴露通用 IPC、文件系统或 shell。
- 生产环境经受限的 `threadline://app/` protocol 加载 `.next-electron`，拒绝错误 host 和路径穿越；开发环境仅加载明确的本地 Next URL。
- Windows x64 NSIS：用户级、`oneClick: false`、桌面和开始菜单快捷方式、输出 `release/`、artifact `Threadline_${version}_${arch}-setup.${ext}`。本次不引入签名、自动更新或 portable 包。

## 公共 Desktop Bridge

```ts
type ThreadlineDesktopBridge =
  | {
      environment: 'electron';
      role: 'main';
      hydrateDesktopState(payload: DesktopHydrationPayload): Promise<NativeApplyResult>;
      transitionWindow(command: DesktopTransitionCommand): Promise<NativeApplyResult>;
      bringToFront(): Promise<NativeApplyResult>;
      onNativeGeometryChanged(listener: NativeGeometryListener): () => void;
      onPresentationRollback(listener: PresentationRollbackListener): () => void;
    }
  | {
      environment: 'electron';
      role: 'edge-tab';
      restoreMain(): Promise<NativeApplyResult>;
    };
```

- `DesktopHydrationPayload`：`requestId`、mode、presentation、`lastCompactMode` 和 persisted geometry。
- `DesktopTransitionCommand`：`requestId`、目标 mode/presentation 和 Renderer snapshot。
- `NativeApplyResult`：`requestId`、实际 geometry、visible surface 与 fallback reason。
- `NativeGeometryChanged`：实际 geometry、mode、`origin: "user"` 和 native revision。

## Phases

### Phase 0：可复现基线与 pnpm hoisted 硬门禁

- 在 `pnpm-workspace.yaml` 增加 `nodeLinker: hoisted`；pnpm 11 不从项目 `.npmrc` 读取该设置，因此不新增无效 `.npmrc`。
- 重建依赖布局且锁文件不得变化。
- Playwright 支持 `THREADLINE_E2E_PORT`（默认 `3100`）并使用 `reuseExistingServer: false`，端口冲突必须明确失败。
- 执行 lint、typecheck、unit、Web build 和 fresh-server E2E；既有全局 format debt 作为可复现基线，不得扩大，改动文件单独通过 Prettier。

硬门禁：

```powershell
corepack pnpm --version
pnpm config get nodeLinker
pnpm install --force --frozen-lockfile
node -e "console.log(require.resolve('next/package.json'))"
git diff --exit-code -- pnpm-lock.yaml
```

Commit：`chore(build)：建立 hoisted 依赖布局与可复现测试基线`

**Phase 0 结果（2026-08-26）**：`pnpm config get nodeLinker` 返回 `hoisted`，`pnpm install --frozen-lockfile`、Next 根解析、`pnpm lint`、`pnpm typecheck`、`pnpm test`（11 passed）和 `pnpm build` 均通过。`THREADLINE_E2E_PORT=3117 pnpm test:e2e` 确认 Playwright 创建独立 Next 服务器，但得到 31 passed、18 failed、3 skipped；失败集中在任务/Daily 创建、拖放与 reload 持久化断言，必须在 Phase 9 前解决。`pnpm format:check` 报告 39 个既有格式问题；本次改动文件单独通过 Prettier。

### Phase 1：提取框架无关窗口策略

- 将 Tauri bridge 中的模式、尺寸、compact normalization、显示器可见性和 safe-bounds 算法提取为纯 TypeScript desktop policy。
- 保持 Full/Mini/Workstation 与 logical-pixel 语义，补齐多显示器、DPI、负坐标、最小化哨兵值和越界 geometry 测试。

Commit：`refactor(desktop)：提取跨壳窗口状态与几何策略`

**Phase 1 结果（2026-08-26）**：窗口模式、geometry 归一化、显示器可见性与 safe-bounds 已从 Tauri 适配器提取到 `src/lib/desktop-window-policy.ts`。Tauri 适配器仅保留原生 API 映射，现有 Provider 改为直接依赖纯策略；策略测试扩展为 13 个通过用例。无行为偏差。

### Phase 2：Electron 壳、hoisted 二次门禁与可打包骨架

- 增加精确版本 `electron@44.0.0`、`electron-builder@26.15.3`，Node engine 提升到 `>=22.12.0`。
- 在 `allowBuilds` 显式加入 `electron: true`，不启用全局 allow-all。
- 使用 `.cts` 和独立 TypeScript 配置将 Main/Preload 编译为 CommonJS；建立 Electron dev、renderer export、main compile 和 unpacked build 脚本。
- Next 桌面导出使用 `.next-electron`，普通 `pnpm build` 不变；建立 protocol 与 hidden Main 骨架。

硬门禁：

```powershell
pnpm config get nodeLinker
pnpm install
pnpm install --frozen-lockfile
Test-Path .\node_modules\electron\dist\electron.exe
pnpm exec electron --version
pnpm exec electron-builder --version
pnpm desktop:compile
pnpm desktop:renderer
pnpm desktop:build:dir
```

Commit：`feat(electron)：建立安全桌面壳与 hoisted 打包链路`

**Phase 2 结果（2026-08-26）**：`electron@44.0.0`、`electron-builder@26.15.3` 和 Node `>=22.12.0` 已写入项目；`nodeLinker: hoisted` 与 `allowBuilds.electron: true` 已生效，`electron-winstaller` 因本项目只采用 NSIS 而显式拒绝其脚本。`pnpm install --frozen-lockfile`、`electron.exe` 存在性、Electron `v44.0.0`、electron-builder `26.15.3`、Main/Preload 编译、`.next-electron` export、`desktop:dev`、Windows x64 `desktop:build:dir` 和 unpacked app 启动均通过。

**Phase 2 deviation（2026-08-26）**：官方 Electron artifact 直连网络超时，因此仅在 Electron 官方 postinstall、frozen install 和 electron-builder 下载流程的当前 PowerShell 中临时设置 `HTTP_PROXY` 与 `HTTPS_PROXY` 为 `http://127.0.0.1:7890`，并让 Electron 官方下载器读取该代理。代理先经 GitHub Release artifact 的 HTTP 200 验证；下载保持官方来源与默认 checksum 校验。每条命令结束时均清除相关环境变量，未修改系统代理、Git 配置、仓库配置或下载源，也不构成项目永久依赖。

### Phase 3：类型化 Preload、Role 分流与启动握手

- 实现 role-discriminated bridge、Provider 外分流、8 秒安全 fallback 与启动 acknowledgement。
- 验证持久化 Mini、Workstation、Edge 冷启动不闪现 Full。

Commit：`feat(desktop)：实现角色隔离与窗口启动 hydration 握手`

**Phase 3 结果（2026-08-26）**：已建立 role-discriminated `window.threadlineDesktop`，Main 只暴露受校验的 hydration/transition/focus/订阅接口，Edge 只暴露 `restoreMain`。`ThreadlineRoot` 在任何业务 Provider 前同步分流，Edge 只挂载 `DesktopEdgeSurface`，不会挂载 `TaskDashboard`、桌面 Provider 或 PWA 注册器。Main 以 `show: false` 创建，等待 Renderer persisted desktop state hydration 和 `ready-to-show` 后应用 native bounds 并 reveal；8 秒超时或非法 payload 均回退安全 Full。开发壳的 BrowserWindow 检查确认 Main 在 handshake 后可见，且 renderer URL 含受控的 `main` role 标记。`pnpm lint`、`pnpm typecheck`、`pnpm test`（13 passed）、`pnpm build`、`pnpm desktop:renderer` 和 `pnpm desktop:compile` 均通过；deviations：None。

### Phase 4：Main 原生状态权威与 feedback-loop 防护

- 实现 revision、程序化 geometry 抑制、用户 geometry debounce 和 canonical geometry 回写。
- 移除 Renderer 直接读写原生窗口和由持久化 effect 自触发的 transition。

Commit：`refactor(desktop)：统一原生窗口状态权威与几何回传`

**Phase 4 结果（2026-08-26）**：Renderer 的 mode、presentation、last compact mode 与 persisted geometry 仍为业务期望状态；Main 负责真实 bounds、可见性与 native revision。Electron transition 统一携带递增 `requestId`，Main 拒绝过期或非法请求并返回 canonical geometry。程序化 `setBounds` 设有抑制窗口，只有 Main 防抖后的真实 `move`/`resize` 才以 `origin: "user"` 回传；Renderer 仅持久化该 canonical geometry，不因回写再次发起 transition。`pnpm lint`、`pnpm typecheck`、`pnpm test`（13 passed）与 `pnpm desktop:compile` 均通过；deviations：None。

### Phase 5：迁移 Full、Mini Today、Workstation

- 将三态切换接入 Main BrowserWindow；Full 原生 frame/可最大化/非置顶，紧凑模式保留各自 bounds、置顶和安全恢复。
- 浏览器/PWA 中相同行为只改变业务 view，不调用原生 API。

Commit：`feat(desktop)：迁移三态窗口行为到 Electron Main`

### Phase 6：Edge Window 与强制可见 fallback

- 实现独立 Edge、右侧停靠、恢复入口及全部 create/load/crash/closed/display-change fallback。
- 所有切换先显示目标再隐藏源；Main/Edge 双故障时重建 Main，失败则错误提示并退出。

Commit：`feat(desktop)：实现 Edge 轻量窗口与可见性故障恢复`

### Phase 7：Windows 生命周期、单实例与任务栏身份

- 实现 AppUserModelID、single-instance、display lifecycle 和 Main 非预期 crash/closed 恢复。
- Windows `window-all-closed` 必须退出。

Commit：`feat(windows)：统一单实例生命周期与任务栏应用身份`

### Phase 8：Web/PWA 解耦回归

- 用 desktop bridge marker 取代 Tauri 环境判断；Electron 跳过 Service Worker，普通浏览器继续注册。
- 确保业务数据层保持 Renderer 端。

Commit：`refactor(web)：解除 PWA 与 Tauri 环境探测耦合`

### Phase 9：自动化与故障注入

- Vitest 覆盖 policy、revision、handshake/timeout、Edge role 和 visible-surface 状态机。
- Playwright Electron 覆盖模式切换、冷启动、single-instance、Edge 故障和可见性不变量；浏览器 Playwright 覆盖 desktop/mobile/PWA。

Commit：`test(desktop)：覆盖 Electron 启动切换与故障恢复`

### Phase 10：NSIS 打包与 Windows 验收

- 生成 unpacked app 与 NSIS installer；在干净用户目录验证安装、重启、升级覆盖、卸载和任务栏固定。
- Main/Edge 必须归入一个 Threadline 任务栏组，固定快捷方式再次启动命中同一实例。

Commit：`build(windows)：配置 Threadline NSIS 安装与发布产物`

### Phase 11：删除 Tauri 并完成文档交接

- 仅在 Phase 10 完全通过后删除 `src-tauri/`、Tauri 依赖、脚本、环境变量和运行时探测。
- 更新 README、AGENTS、架构/开发/发布文档；本文件标记 `Completed`，补齐验证与 deviations。
- 确认无 Tauri 运行时、构建或测试残留；PR 正文严格基于实际 diff 和验证。

Commit：`refactor(desktop)：移除 Tauri 壳并完成 Electron 迁移交接`

## 最终验收与 Git 约束

最终至少执行：

```powershell
pnpm install --frozen-lockfile
pnpm config get nodeLinker
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm desktop:compile
pnpm desktop:renderer
pnpm test:electron
pnpm desktop:build:dir
pnpm desktop:build
```

- hoisted linker 在 Phase 0、Phase 2 和最终 CI 都是硬门禁。
- Web/PWA、Full、Mini Today、Workstation、Edge 均通过回归；Edge 不初始化完整业务运行时；进入运行态后不出现 Main/Edge 同时不可见。
- 每个 commit 只包含单一 Phase，遵守 `<type>(<scope>)：<summary>`；每个 Phase 最终 commit 同步本文件。
- 推送/PR 前检查 `git status`、`git diff --check`、`git diff origin/main...HEAD`、实际提交序列及敏感/未跟踪文件。
- PR 必须按仓库规范使用 Summary、背景、改动（逻辑）、改动（代码）、影响、验证、材料；未完成的人工 Windows 验收必须明确标注。
