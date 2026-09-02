<!-- 文件用途：说明 Electron Main、Preload、编译配置和打包配置在桌面壳中的职责边界。 -->

# Electron desktop shell

- `main.cts`：仅负责应用生命周期、受限 renderer 加载、BrowserWindow 创建，以及经过协议校验的系统 `mailto:` 外链。
- `preload.cts`：仅通过 contextBridge 暴露窄的、按窗口角色区分的桌面接口；不泄漏通用 IPC 或任意外链能力。
- `tsconfig.json`：把 Main 与 Preload 输出为 `dist-electron/*.cjs`，避免根包的 ESM 设置影响 sandbox preload。
- `electron-builder.config.cjs`：定义 Windows NSIS 与 unpacked package 产物；`electron/assets/icon.ico` 是 BrowserWindow、EXE、NSIS 和快捷方式共用的 Windows 图标源。

业务 state、Supabase、React Query 和任务视图始终位于 Renderer，不能导入本目录。
