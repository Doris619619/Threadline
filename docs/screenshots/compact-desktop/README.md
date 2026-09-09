<!-- 文件用途：记录 2026-09-09 表单与原生便签的实际缩放截图和验证边界。 -->

# 表单与桌面便签验证

本机 Windows 11 / Electron 44，屏幕缩放 250%，工作区 1152 × 672 逻辑像素。截图来自隔离 userData 的真实 Electron 窗口；任务为 local adapter 的虚构数据，未操作真实云账号。

- `workstation-anya.png`：4 条任务，200 × 182 逻辑像素，右侧无操作占位列，长名称可用满行宽。
- `workstation-menu-anya.png`：右键菜单在 200px 窗口内部定位；移出后引用从 4 条减到 3 条，原任务数不变。
- `edge-fixed.png`：当前贴边入口，250% 缩放下原生外框约 32×105 逻辑像素，连续拖动不会拉长。
- `workstation-0.png`、`workstation-1.png`、`workstation-12.png`：高度分别为 111、98、220 逻辑像素。
- `workstation-{blue,anya}-{light,dark}-serif.png`：蓝／粉、明／暗、思源宋体，保持主题与字体选择，任务行无横向溢出。
- `login-anya.png`：正式静态预览 EXE 的欢迎页，关闭/最小化按钮在标题栏常显。原生窗口工作区中心偏差小于 4 逻辑像素。
- `task-dialog-anya.png`：任务名、项目、并排起止时间、并排预计和实际；单一待定占位、文字取消与主题保存。
- `waiting-create-anya.png`：待安排新增的粉色宋体表单。事项内容扩展至首行右侧，取消/保存位于第二行预计输入旁；260/300/360px 桌面侧栏和 390px 手机的输入宽度、对齐及保存回归通过。

验证命令与结果：

- `pnpm test --maxWorkers=2`：51 个文件、233 项通过。右键改动后重跑 compact-workspace：3 项通过，包括 Escape 取消和 Shift+F10 打开。
- `pnpm typecheck`、`pnpm lint`：通过（直接调用本地 TypeScript / ESLint CLI）。
- `pnpm test:e2e --project=ui-layout-desktop-1280 --project=ui-layout-mobile-390 --project=ui-mobile-form-controls`：29 项通过，含新增、编辑、清空预计、空时段、长标题、放大字号与 iPhone WebKit 表单字号。
- `pnpm test:electron` 及更新后的 `node scripts/test-electron.mjs`：通过。覆盖模式切换、关闭、悬停不展开、拖动不展开、单击恢复、原生置顶属性与贴左位置重启恢复。拖动测试驱动真实 Renderer 指针事件，Main 的原生 cursor 坐标由测试输入控制。

粉色 `desktop:preview` 构建成功；`scripts/test-packaged-electron.mjs` 验证 EXE 图标与粉色 ICO 一致、生产协议/CSP、登录居中、第二实例退出和标题栏关闭均通过。

物理多显示器拔插、跨屏拖动、真实云账号同步与真实 iPhone PWA 未在本轮测试；显示器与无效位置的安全恢复由窗口 policy 单测覆盖。数据库与任务数据规则没有改变。

2026-09-09 后续修复：移除独立今日小窗和对应截图；工作站标题栏删除“今日”入口。已更新 `workstation-anya.png`、`workstation-menu-anya.png` 与 0/1/12 条任务截图。其他主题与表单图片保留为此前布局参考。

本次隔离静态 adapter 验证：旧模式和宽度偏好迁移后为工作站 200×182，废弃模式选择键与旧 geometry 清除，4 条引用保留；右键移除后为 3 条，原任务仍为 4 条。x=601、y=101 时手动调至 280，连续 100 次高度更新后宽度仍为 280。空/1/12 条分别为 200×111、200×98、200×220，最后一组内部滚动，均无横向溢出。根因与连续拖动原生回归见 [窗口文档](../../desktop-window-modes.md)。
