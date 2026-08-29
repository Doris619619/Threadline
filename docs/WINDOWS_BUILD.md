<!-- 文件用途：定义 Threadline Windows Preview、正式打包、产物验证与本机构建故障诊断流程。 -->

# Windows 本地 Preview 与正式打包

## 日常命令

用户说“给我最新 EXE”“打个 EXE 验收”或“给我快速版”时，默认执行：

```powershell
pnpm desktop:preview
```

成功产物固定为：

```text
release/preview/win-unpacked/Threadline.exe
```

普通 Preview 不会自动启动应用；需要构建后立即打开时显式执行：

```powershell
pnpm desktop:preview:open
```

用户明确要求正式安装包时执行：

```powershell
pnpm desktop:build
```

该命令生成 `release/Threadline_<version>_x64-setup.exe`。`desktop:release` 仅供版本 tag 或手动 GitHub Release workflow 发布使用；`desktop:build:dir` 作为 CI 和兼容入口，继续生成 `release/win-unpacked/Threadline.exe`。

## Preview 的严格定义

Preview 是 **production-equivalent unpacked Electron app**：它与正式 package-dir/NSIS 使用相同的 Renderer production build、Main、Preload、`electron-builder.config.cjs`、files、ASAR、`afterPack`、Electron fuses、图标和 Electron assets。

它运行时保持：

- `app.isPackaged === true`；
- `threadline://app` production protocol；
- production CSP；
- `contextIsolation: true`、`nodeIntegration: false` 和 sandbox；
- 正式 preload bridge、IPC、BrowserWindow 与本地数据语义；
- Embedded ASAR integrity 与 `OnlyLoadAppFromAsar`。

Preview 不是 dev server、`file://`、开发模式 Electron，也不是手工复制 `node_modules/electron/dist` 得到的近似包。它能验收 UI、交互、production renderer、窗口行为、IPC、Full、Mini Today、Workstation 和 Edge。它只省略 NSIS，因此不验证安装/卸载流程、安装目录 UI、快捷方式、Start Menu 和其他 installer-specific 行为。

## 输出、锁与 Manifest

Preview 与正式产物不会写入同一个 `win-unpacked`：

```text
release/
  preview/
    win-unpacked/
    build-manifest.json
    parity-report.json
  win-unpacked/
  build-manifests/
    package-dir.json
    release.json
  Threadline_<version>_x64-setup.exe
```

每次打包在 `.tmp/desktop-packaging.lock.json` 原子获取共享锁。另一个 Preview/Release 已运行时，新命令以 `DESKTOP_BUILD_ALREADY_RUNNING` 退出；锁内 PID 全部消失时才自动回收 stale lock。不要为解决冲突结束全部 `node.exe`。

打包前会记录 branch、HEAD、clean/dirty 和 dirty paths。Preview 允许 dirty，但成功摘要和 manifest 会明确标记 `Working tree: DIRTY`；该 EXE 不能被描述为精确对应远程 commit。

成功 manifest 包含工具版本、配置 hash、阶段耗时、ASAR/fuses、Defender exclusion 检测结果以及 EXE/installer 的绝对路径、大小、hash 和时间。旧 manifest 会在本目标构建前删除，EXE 和 ASAR 必须晚于本轮开始时间，避免旧产物被误报为新产物。

## Production parity 验证

执行：

```powershell
pnpm desktop:verify:parity
```

命令只生成一次 Renderer/Main/Preload 输入，再分别用正式 builder config 生成 Preview 与 canonical package-dir。验证包括：

- app.asar 文件集合和内容；
- Main、Preload、Renderer assets 和 packaged runtime tree；
- 两个 EXE 的 fuse wire；
- Preview 与 canonical 的 packaged Electron smoke；
- `app.isPackaged`、`threadline://app`、production CSP、preload/IPC 和所有桌面窗口模式。

PE 本体不要求逐字节相同，因为 ASAR integrity resource、fuse 写入和签名 metadata 位于 EXE 内；这些区域通过 ASAR 内容比较、fuse wire 和 runtime smoke 分别验证。任何运行相关文件或安全策略差异都会返回 `DESKTOP_BUILD_PARITY_FAILED`，不会生成通过报告。

## `PACKAGING_STALL` 与 Windows Defender

已确认的典型指纹：Renderer、CSP、precache、Main/Preload 均完成，electron-builder 已输出 `packaging`，随后日志和目标目录长时间都不再变化。此时不应重新调查 React、CSS 或 Next Renderer。

脚本同时监控 builder 输出和目标目录。两者连续 180 秒无变化时返回 `PACKAGING_STALL`，记录 builder PID、命令、当前阶段、目录快照、子进程树、CPU/I/O 计数、第二个 builder 和目标 EXE 状态；随后只结束本轮拥有的 builder 进程树，不并行重试。

优先检查 Windows Defender 或其他文件系统安全扫描。脚本只读取当前 exclusion，不会执行 `Add-MpPreference`、关闭 Defender 或永久排除整个仓库。

如需临时排除，使用管理员 PowerShell，范围限制为 Electron runtime 和当前输出目录：

```powershell
Add-MpPreference -ExclusionPath "D:\Repo\Threadline\node_modules\electron\dist"
Add-MpPreference -ExclusionPath "D:\Repo\Threadline\release\preview"
```

正式 package-dir/NSIS 构建时将第二条改为 `D:\Repo\Threadline\release`。构建结束后恢复：

```powershell
Remove-MpPreference -ExclusionPath "D:\Repo\Threadline\node_modules\electron\dist"
Remove-MpPreference -ExclusionPath "D:\Repo\Threadline\release\preview"
```

如果此前排除了整个 `D:\Repo\Threadline`，应在确认窄范围策略可用后手工移除整仓库 exclusion；仓库脚本不会擅自修改系统安全配置。

## 下载代理与其他错误

首次或 cache 缺失时，electron-builder 仍可能从 Electron/GitHub 下载官方 runtime。网络超时与 `PACKAGING_STALL` 不同：前者会明确输出 `ETIMEDOUT`/下载错误并退出。

需要本机代理时只在调用环境中显式设置，不将个人代理写入仓库：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
pnpm desktop:preview
```

Preview、package-dir 和正式 build 都继承调用者环境。代理不可用时应修复代理或网络，不得改成手工 runtime copy 来绕过 production 打包语义。

## 验证清单

修改 Windows 打包链后至少执行：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm desktop:compile
pnpm desktop:renderer
pnpm test:electron
pnpm desktop:preview
pnpm desktop:build:dir
pnpm desktop:verify:parity
pnpm desktop:build
```

涉及 Renderer 时同时执行 `pnpm build` 与 `pnpm test:e2e`。只有 parity、packaged smoke、ASAR 和 fuse 验证全部通过，才能把 Preview 描述为正式运行环境的可靠验收包。
