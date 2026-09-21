<!-- 文件用途：说明 Electron Main、Preload、编译配置和打包配置在桌面壳中的职责边界。 -->

# Electron desktop shell

- `main.cts`：仅负责应用生命周期、受限 renderer 加载、BrowserWindow 创建，以及经过协议校验的系统 `mailto:` 外链。
- `compact-controls.cts`：校验便签内容高度、原生贴边拖动、显示器位置恢复与主题图标；仅保存设备偏好。
- `auto-start.cts`：仅 Windows NSIS 安装版可通过可信主窗口读取、设置自启动或记录以后再选；固定可执行文件与当前用户注册表项，系统回读为真源。升级保留，卸载清理本应用启动项。
- `preload.cts`：仅通过 contextBridge 暴露窄的、按窗口角色区分的桌面接口；不泄漏通用 IPC 或任意外链能力。
- `tsconfig.json`：把 Main 与 Preload 输出为 `dist-electron/*.cjs`，避免根包的 ESM 设置影响 sandbox preload。
- `electron-builder.config.cjs`：定义 Windows NSIS 与 unpacked package 产物；`electron/assets/icon.ico` 与 `icon-anya.ico` 分别是蓝/粉 Windows 图标源。THREADLINE_DESKTOP_THEME=anya 选择粉色打包，新设备首帧沿用包主题，运行时窗口图标跟随外观偏好。

业务 state、Supabase、React Query 和任务视图始终位于 Renderer，不能导入本目录。
