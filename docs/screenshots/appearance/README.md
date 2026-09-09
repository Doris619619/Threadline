<!-- 文件用途：保存本次布局与外观改动的前后截图、复现条件和验证边界。 -->

# 布局与安妮雅主题验收

## 截图来源

`before/` 原样保留用户提供的 P1–P4。调整后使用隔离 local test adapter 演示任务，日期固定为 2026-09-08；不是用户线上账号的数据。手机截图为 Chrome 模拟 390×844 CSS px，蓝色示例使用默认字体，安妮雅示例主要使用思源黑体。浏览器截图不包含 iPhone 系统状态栏。

另保留用户指出视觉杂乱的[首版字体选择](before/font-chooser.png)；最终改为连续列表、统一名称排版、轻量选中状态，仅样张保留不同字体。
`font-samples.png` 单独截取字体字段组，便于完整比较三种样张。

| 原始问题                                | 调整后                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| [P1 页头](before/p1-home.png)           | [安妮雅首页](anya-home-light.png)、[默认蓝色](blue-home.png)：标题与日期分行、前后按钮靠右   |
| [P2 重复待安排](before/p2-planning.png) | [规划](anya-planning-light.png)：仅底部任务池，四级粉色热力                                  |
| [P3 页头与箭头](before/p3-projects.png) | [项目](anya-projects.png)：单行页头、轻量分组、行尾箭头                                      |
| [P4 回收站](before/p4-trash.jpg)        | [回收站](anya-trash.png)、[空状态](anya-trash-empty.png)：唯一标题、长标题换行、紧凑恢复按钮 |

其他材料：[外观选择](anya-appearance.png)、[三种真实字体样张](font-samples.png)、[宋体首页](anya-home-serif.png)、[深色首页](anya-home-dark.png)、[深色规划](anya-planning-dark.png)、[桌面 1440×900](anya-desktop.png)、[320px／200% 文字](anya-320-enlarged.png)、[Windows Electron](anya-electron.png)。Electron 截图为真实 Windows 测试窗口，图片物理像素受当前系统缩放影响。

## 验证记录

- 全量 Vitest：51 个文件、231 项通过；包含偏好解析/首屏脚本一致性、Service Worker 响应克隆与 CSS token 合同。lint、TypeScript 检查通过。
- 外观＋规划＋通用无障碍回归：49 项通过，覆盖 Chrome 桌面/手机和 iPhone WebKit、主题/字体独立选择、同源标签同步、真实字体加载、失败重试、四级热力明暗对比、连续安排与焦点返回、回收站恢复。
- 字体列表精简后重新顺序构建 Web 与 Electron；最终外观回归 **15 项全部通过**。补齐紧凑视图和启动页语义配色后复查 CSS token；当时的 Electron 紧凑窗口深色背景与当前主题一致，退出重启保留主题和字体。
- 布局矩阵覆盖 320／375／390／430px、1440px 桌面、iPhone WebKit 与移动输入字号，含 200% 文字、长标题、Daily 表单与新增任务控件。初轮 81 项中 79 项通过，两个控件尺寸断言因 Chromium 把 44px 返回为 43.999969px 失败；仅为断言加入 0.001px 测量容差后，外观与 320／375px 布局定向回归 **27 项全部通过**，不降低产品触控尺寸。
- Web production build、请求 nonce CSP 校验、Electron 静态 Renderer/hash CSP、Electron Main/Preload 类型检查及编译通过。
- `node scripts/test-electron.mjs`：实际 Windows 窗口切换冒烟通过；另用隔离 Electron profile 验证退出重启后仍保留安妮雅与已解码的思源黑体。
- 允许 Service Worker 的独立 Chrome profile：字体网络请求成功后确认字体/插画实际写入 Cache Storage，断网刷新后安妮雅主题和思源黑体仍成功显示。不同于常规 E2E 的禁用 Service Worker 模式。
- 静态导出会替换 Next 的中间产物，因此 Electron 构建与 Web 运行验收顺序执行；中途被构建替换影响的测试轮次已作废并重建重跑。

## 合并前审计补充

审计发现桌面日期文字区域只聚焦透明输入框、未显式打开原生日历。新增回归在原提交上失败（打开次数为 0），补齐整块点击与 Enter/空格调用后，桌面、手机和 WebKit 的 18 项外观回归全部通过；另在真实 Chrome 原生 API 上确认成功打开。lint、TypeScript、Web production build 与 nonce CSP 检查通过。API 不可用或受限制时保留原生输入行为。README 的使用路径不变。

完整 CI 首轮暴露两处测试维护问题：回收站按钮增加任务名称后，旧测试仍按“恢复”精确匹配；包含两种中文可变字体首次解码、刷新、明暗与跨标签同步的单个 WebKit 用例超过 30 秒。现按实际无障碍名称定位恢复按钮，将字体与系统外观/同步拆开，并仅给真实字体解码用例 60 秒预算，保留全部功能断言。此次只修改测试；README 产品说明无需调整。

修订后本地外观及回收站定向回归 23 项全部通过；lint、TypeScript 检查通过。完整远端门禁以 PR #33 当前提交的 Checks 为准。

## 尚需真机验收

WebKit 设备模拟不等同于 iPhone 真机 PWA。iOS 系统 Dynamic Type、原生日期弹层、安全区、主屏幕启动及系统清理离线缓存仍需要真实设备验收。Windows 已验证开发 Electron 壳和静态 Renderer 构建，本次没有生成/安装新的正式安装包。未部署生产、合并分支或变更数据库。
