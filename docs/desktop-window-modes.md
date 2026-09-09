<!-- 文件用途：记录完整工作台、工作站与贴边入口的交互、原生尺寸和兼容迁移。 -->

# 桌面交互与窗口形态

Web/PWA 保持完整工作台。Windows Electron 使用同一 Main BrowserWindow 承载完整工作台和工作站；收起时用独立的 Edge BrowserWindow 显示入口。Edge 不挂载业务 Provider，也不访问任务仓储。

## 完整工作台与工作站

- 完整工作台无原生标题栏、非置顶；保留全部导航。仅 Electron 提供工作站、最小化、最大化/还原与关闭按钮。启动与登录阶段也有关闭和最小化按钮，首次显示居中于指针所在显示器的工作区。
- 工作站始终置顶。标题栏仅显示“工作站／清空／收起／关闭”，中间是连续的“序号＋项目＋任务名”，底部打开完整工作台。拖动标题栏移动窗口，拖动边框可调宽。
- 工作站保存 `threadline.workstation.v1` 的有序 task ID 引用。改名和项目变化会同步；右键或 Shift+F10 可移出引用，拖动任务可排序。移出和清空不会删除、完成或修改原任务；真正移入回收站的任务才自动清理引用。
- 工作站每个新进程初始宽度 200 logical px，保留有效位置；当前运行期间可调至 340px，切换和收起/展开保留用户宽度。默认高度 200px，按列表自然高度加 68px 调整，范围 96–220px；大量任务只滚动列表，不滚动标题栏。
- Full 默认 1280×840，最小 800×560；屏幕工作区域不足时做可见性保护。最大化和最小化期间不保存异常 bounds。

## 贴边入口与尺寸稳定性

“收起”只隐藏工作站，入口显示时用 `showInactive` 避免抢焦点。入口和工作站均原生置顶；悬停不展开，明确单击或键盘激活恢复工作站。超过 4 DIP 算拖动，松手吸附到所在显示器左右边缘，拖动结束不展开。

入口规格为 28×104 logical px，Main 设置一致的最小/最大尺寸。Windows 的最小原生窗口宽度和 DPI 取整可能使读回外框略大：本机 Windows 11、Electron 44、250% 下外框稳定为 32×105。尺寸不能从 `getBounds()` 读回后再用于定位。

本次故障在相同机器的隔离原生窗口中复现：旧 `setPosition` 定位链连续调用 100 次，外框高度从 106 变为 206，每次约增加 1 DIP；`setBounds({...getBounds(), x, y})` 同样累积。按住拖动时的高频指针消息重复调用这条链，因此入口不断拉长。固定尺寸的 `setBounds({width:28,height:104,x,y})` 对照组 100 次始终为 32×105。

修复后拖动和屏幕重新定位都传入固定规格，原生最小/最大尺寸作为第二道保护。相同位置不重复定位。入口位置只保存显示器 ID、左右侧和纵向比例；原屏幕移除时回退 Main 所在屏幕。工作站仍可手动调宽，固定尺寸限制仅用于入口。

工作站的自动高度也存在同源问题：例如 x=601、y=101 在 250% 下对应分数物理像素，旧代码将向外取整后的外框宽度再次写回，280px 会逐渐增大到原生上限。Main 现在统一用 `readFramelessGeometry` 读取可重用的内容宽高与屏幕位置，高度调整、用户尺寸保存、收起与恢复均使用它。修复后相同坐标连续 100 次交替高度更新，内容宽度始终为手动设定的 280px；外框允许固定的取整差异，但不能累积。

## 状态、恢复与迁移

- 当前模式仅为 `full`、`workstation`，收起属于 `edge-collapsed` presentation。独立今日小窗的 UI、模式、按钮、样式、专用新增草稿与动作、截图已移除。
- 旧 `mini-today` 偏好在读取时迁移到工作站；旧 geometry 从保存对象中剔除，`threadline.desktop-last-compact-mode.v3` 删除。仅保留这段兼容识别，不保留旧视图。任务、预计、日期和工作站引用不迁移，不需要数据库变更。
- 当前偏好键为 `threadline.desktop-mode.v3`、`threadline.desktop-window-states.v3`、`threadline.desktop-compact-presentation.v3`；重置仅清空位置/尺寸。Web/PWA 不会因历史桌面偏好进入小窗。
- Renderer 在业务就绪后只发起一次 hydration。Main 校验模式、geometry、来源角色与 requestId，返回原生状态；Renderer 以递增 stateRevision 保存状态并 ACK。保存用户 geometry 不触发反向 transition。
- 工作区、DPI 和显示器变更重新检查可见区域。Full 离屏时居中回退，工作站离屏时移到工作区右上方并留 24px；已收起时只定位 Edge，不调整隐藏 Main，也不等待后台 ACK。
- 收起采用 Main 当前真实尺寸，忽略过期 Renderer 宽度；隐藏/最小化时忽略内容高度消息。迟到的启动居中请求和启动 watchdog 不得覆盖已经选定的业务窗口状态。
- 单实例锁保证重复启动唤醒已有窗口；Edge 可见时恢复工作站。Edge 加载失败、崩溃或异常关闭时恢复 Main，避免应用无可见入口。

## 原生接口

`desktop:compact-height` 只接受 workstation 与有限高度；`desktop:appearance` 仅接受 blue/anya；`desktop:edge-pointer` 仅接受 Edge 的 start/move/end/cancel，坐标由原生 screen 获取。主题和入口位置保存在 Main 的 `compact-preferences.json`，不接触业务数据。拖动区与按钮区按 [Electron 窗口交互规则](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) 分开。

## 验证

`pnpm test:electron` 构建测试 adapter 并运行业务窗口烟测，包含工作站连续 100 次高度调整和入口连续 120 次 Renderer 指针拖动。`node scripts/test-electron-collapse.mjs` 在生产静态 Renderer 与 Main/Preload 构建完成后单独运行，使用隔离登录门禁，不需要登录。

原生回归检查手动 340→200、过期宽度收起、迟到高度、后台 ACK、100 次不移动的按住消息、左右各 120 次拖动、20 次显示器通知、悬停不展开和单击恢复。在本机 250% 下拖动前后外框保持 32×105。测试仅控制 cursor 输入；IPC、原生窗口、定位及 Windows DPI 转换真实执行。UI 烟测另以 Renderer 指针事件验证拖动捕获与松手行为，并检查置顶和重启位置。

物理多显示器拔插与跨屏缩放需要额外设备验收；自动化显示器通知不能替代实际拔插。

## 任务拖拽与批注

今日日程拖到待安排会清除日期、待填时间与起止时间，保留独立预计。荧光笔/橡皮擦激活时锁定任务拖拽和行内编辑；Esc 或再次点击退出。笔迹按相对坐标保存，窗口缩放后保持对齐。
