<!-- 文件用途：记录桌面工作台的拖拽排程、荧光笔批注与完整工作台/迷你今日/工作站三态窗口行为。 -->

# 桌面交互与窗口形态

本文档描述首页今日工作台的拖拽排程、荧光笔批注，以及 Windows 桌面端的三态工作流。Web/PWA 与桌面端共用前端；Electron native geometry 仅在桌面端生效。

## 任务拖拽与批注

- 今日日程与无时间待办之间可拖拽同一条任务记录。拖入日程会进入持久化的 `schedulePendingTime`，不会猜测开始时间；拖回待办会清除所有排程字段。
- 荧光笔或橡皮擦激活时锁定任务拖拽与行内编辑，Esc 或再次点击当前工具退出。笔迹按相对坐标保存，窗口缩放后保持对齐。

## 三态工作流

- **完整工作台**：原生标题栏、非置顶，保留首页、日程、项目、统计、复盘与设置。右上角有两个直接入口“迷你今日”和“工作站”，单击立即切换。
- **迷你今日**：始终置顶的紧凑快速视图，显示“今日日程”和“无时间待办”。每行可完成任务，也可加入或移出工作站；不显示统计、Planning Queue、Daily 和批注工具。
- **工作站**：始终置顶的小尺寸提醒窗，只显示有序的序号、项目和任务名。它保存 `threadline.workstation.v1` 中的 task ID 引用，不复制标题或任务内容；因此改名或改项目会同步。移除、清空和拖动排序只改引用集合，不会删除、完成、移期或修改原任务。

迷你今日与工作站使用**同一个带 Windows 原生边框的 Electron Main BrowserWindow**平滑变形；底部“打开完整工作台”会恢复完整工作台并保留此前侧边栏页面。

## 右侧收起入口

右侧 edge tab 不是第四种窗口模式。只有迷你今日和工作站可通过“收起”进入 `edge-collapsed` presentation；悬停约 260ms 或点击后恢复最近的紧凑视图。完整工作台不能收起为 edge tab。

edge tab 是独立的无边框 Electron BrowserWindow，固定在当前显示器 work area 的右边缘，并使用 logical pixel 安全 bounds，避免多显示器和 DPI 缩放下的单屏硬编码。

## 原生窗口恢复与单实例

- 只在状态水合完成时恢复一次原生窗口；用户移动/缩放产生的 geometry 写回不会反向触发窗口 apply，避免持续跳动。
- 展开窗口恢复前会以 Electron `screen` 的 logical work area 校验可见矩形。`-32000` 最小化哨兵、已拔除显示器、DPI 变化或只露出极小边缘时，完整工作台居中回退，迷你今日和工作站回退到当前工作区右上方并保留 24px 边距。
- 最小化期间不持久化 geometry。每次启动、三态切换、edge tab 恢复和第二次启动都会先取消最小化、显示并聚焦窗口，再执行可见性保护。
- Windows 使用 Electron `requestSingleInstanceLock()`。重复启动不会创建第二个应用；既有可见窗口会被唤醒。若当前只显示 edge tab，Main 会恢复最近的紧凑视图；若已展开，则保留当前视图。
- Renderer 命令的 `requestId` 只用于命令回包关联；Main 的 canonical state 使用独立递增的 `stateRevision`。Edge 恢复、第二实例和故障恢复会先广播该状态，等待 Main Renderer 写入 v3 状态并确认对应 revision，再显示 Main、隐藏 Edge。确认超时仍显示安全 Main，避免两个 surface 同时不可见。

## 持久化与尺寸保护

- v3 key：`threadline.desktop-mode.v3`、`threadline.desktop-window-states.v3`、`threadline.desktop-last-compact-mode.v3`、`threadline.desktop-compact-presentation.v3`。
- 旧 v2 的 `floating-icon` 和 72px geometry 不会迁入；非法旧值安全回退到完整工作台。
- Mini Today 限制为 340–560 × 420–820 logical px；Workstation 限制为 260–360 × 220–640 logical px。重置窗口尺寸与位置会清空 v3 geometry。
- 真正移入回收站的任务会从工作站引用集合清除；完成任务不会自动移除。
