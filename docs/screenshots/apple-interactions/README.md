<!-- 文件用途：记录 Apple 交互整改截图的真实来源、查看入口、缩放取证方式与证据边界。 -->

# Apple 交互整改视觉证据

本目录选录 77 张原始 PNG，未做裁切、合成、压缩或像素修改。除专门保留的 CDP 空白诊断图外，所选图片及完整本地批次均已逐张打开，确认有对应模块的内容。截图帮助检查布局与状态；菜单键盘行为、保存屏障、命中区域及强制色等结果仍以相应自动化验收为准。

## 来源与查看入口

| 来源                                                                                       | 环境与数据                                                                                  | 尺寸与时间                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `before/home-desktop.png`、`before/keyboard-focus-desktop.png`、`before/plans-desktop.png` | main基线 `6b3b79c6217e9acefa35ceaa7419de0cbb9df1f6`，独立Next development Preview、虚构任务 | Edge，1280×900 CSS viewport，2026-11-19上海时间；长图                                                      |
| `before/review-*.png`                                                                      | 本PR首轮工作树审查三项问题的六张原图；**不是main基线**                                      | 保留首轮桌面/手机原图、源修改时间及SHA-256，详见同目录review-first-pass-manifest.json                      |
| `after/`、`themes/` 的工作台页面                                                           | 本分支生产 Preview，`http://127.0.0.1:32103/`，仓库内置虚构种子；本机独立浏览器上下文       | 桌面1280×900；手机390×844并开启触摸语义；时钟固定为2026-11-19 12:00（Asia/Shanghai）                       |
| 同频                                                                                       | 专用 Next development 页面32100和一次性本地 PGlite/RPC 桥32102，既有虚构身份                | 同上两个viewport；浏览器与种子日期固定；不连接正式账号                                                     |
| 认证                                                                                       | 专用 Next development 表单32120，假loopback配置，认证请求由浏览器拦截                       | 同上两个viewport；错误文案来自明确模拟的无效登录响应                                                       |
| 引导                                                                                       | 生产 Preview 的独立空白个人资料                                                             | 同上；不写入云端                                                                                           |
| `native/workstation-blue-light.png`                                                        | 独立临时profile启动真实Electron，复用生产Preview；通过真实按钮把邮件任务加入工作站          | 实际原生窗口及viewport见清单；窗口可见、未最小化，bounds在真实工作区内                                     |
| `native/` 三张计时站图                                                                     | 原样复制本次已通过的真实静态协议Electron计时站suite输出                                     | 保留源图与源修改时间；该suite未记录三张图的精确主题/viewport，清单明确为未知；图中计时日期未由本批重新固定 |
| `native/full-*.png`                                                                        | 仅复跑完整工作台两档窗口×四档页面缩放，真实Electron，蓝色浅色主题                           | 固定2026-11-19 12:00；实际bounds、viewport、display工作区与scaleFactor全部记录在矩阵                       |

唯一确认批次开始时间为2026-11-19 06:27:03 UTC。完整本地捕获清单包含84条记录；本目录仅复制选定图片。逐文件来源、PNG尺寸及SHA-256见 [evidence-index.json](evidence-index.json)，原始页面/主题/viewport记录见 [capture-manifest.json](capture-manifest.json)。

主首页pair采用同一Preview demo初始条件：桌面1280×900、blue/light、2026-11-19、首图前没有业务操作。两图均为邮件处理、领域论文、准备访学材料、给家人打电话、备份学习资料，统计为1h30min / 3h / 56min；最新DOM快照在清单的 `initialWorkspace` 中。generic test adapter另外包含统计课预习、跑Demo、会议等种子，不能混作这一主pair，也不能把演示任务或统计差异归因于UI改造或数据迁移。

## 前后与主要交互

| 页面或状态   | 整改前                                                  | 整改后                                                                                                      |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 首页         | [桌面首页](before/home-desktop.png)                     | [桌面首页](after/home-desktop.png)、[手机首页](after/home-mobile.png)                                       |
| 键盘焦点     | [结束今天的外围轮廓](before/keyboard-focus-desktop.png) | [背景及内底线](after/keyboard-focus-desktop.png)、[手机键盘焦点](after/keyboard-focus-mobile.png)           |
| 计划         | [计划页面](before/plans-desktop.png)                    | [计划页面](after/plans-desktop.png)                                                                         |
| 首页互斥菜单 | 基线使用原生select                                      | [桌面互斥菜单](after/home-selection-menu-desktop.png)、[手机互斥菜单](after/home-selection-menu-mobile.png) |
| 任务动作     | —                                                       | [分组动作及危险项](after/home-action-menu-desktop.png)                                                      |

## 首轮审查三项的唯一确认

下列before来自本PR首轮审查，单独保存在 before/review-*，与上面的main基线分开记录。六张原图的来源、时间、viewport、theme和SHA-256见 [首轮清单](before/review-first-pass-manifest.json)。确认回合不再扩展审美审计。

| 事项           | 本PR首轮审查                                                                                                              | 最终确认                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目纯命令入口 | [桌面modal](before/review-project-command-modal-desktop.png)、[手机modal](before/review-project-command-modal-mobile.png) | [桌面操作菜单](after/project-management-desktop.png)、[手机操作菜单](after/project-management-mobile.png)；[桌面删除确认](after/project-delete-confirmation-desktop.png)、[手机删除确认](after/project-delete-confirmation-mobile.png) |
| 密码重复图标   | [桌面双眼睛](before/review-auth-duplicate-eye-desktop.png)、[手机双眼睛](before/review-auth-duplicate-eye-mobile.png)     | [桌面单一按钮](after/auth-form-desktop.png)、[手机单一按钮](after/auth-form-mobile.png)                                                                                                                                                |
| 引导重复眉题   | [桌面](before/review-onboarding-eyebrow-desktop.png)、[手机](before/review-onboarding-eyebrow-mobile.png)                 | [桌面步数与主标题](after/onboarding-blue-light-desktop.png)、[手机步数与主标题](after/onboarding-blue-light-mobile.png)                                                                                                                |

项目菜单的初始焦点为修改项目…，危险命令单独分组；只有删除需要确认，对话框初始焦点为取消，Escape归还原触发按钮，捕获过程没有执行删除。焦点值同时记录在manifest，截图本身不替代DOM焦点断言。密码框按 [Microsoft官方文档](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/password-reveal) 仅抑制当前表单的 ::-ms-reveal，保留自定义44px触摸按钮与显示/隐藏功能。引导保留步数、主标题及原有资料保存流程。

## 模块样例

| 模块           | 图片                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 日历           | [日历](after/calendar-desktop.png)                                                                                                                                                                           |
| Daily          | [当日Daily](after/daily-today-mobile.png)、[模板管理列表](after/daily-management-desktop.png)                                                                                                                |
| 项目           | [任务详情](after/projects-desktop.png)、[桌面操作菜单](after/project-management-desktop.png)、[手机操作菜单](after/project-management-mobile.png)、[删除确认](after/project-delete-confirmation-desktop.png) |
| 阶段时间       | [新版环图](after/stage-ring-desktop.png)、[经典环图手机暗色](after/stage-ring-classic-mobile.png)、[首页时间分布](after/home-time-distribution-desktop.png)                                                  |
| 习惯、节律     | [习惯](after/habits-desktop.png)、[节律](after/rhythm-mobile.png)                                                                                                                                            |
| 洞察、设置     | [洞察](after/insights-desktop.png)、[设置](after/settings-mobile.png)                                                                                                                                        |
| 工作站、计时器 | [真实原生工作站](native/workstation-blue-light.png)、[手机三条暂停计时](after/timers-mobile.png)                                                                                                             |
| 计时站         | [200×112最小控件可达区域](native/minimum-reachable-controls.png)、[双计时横排窄窗](native/two-timers-small.png)、[纵向最小窗](native/vertical-minimum.png)                                                   |
| 同频           | [安雅暗色](after/together-desktop.png)、[手机编辑器焦点](after/together-editor-mobile.png)                                                                                                                   |
| 认证、引导     | [手机认证表单](after/auth-form-mobile.png)、[真实忙碌状态](after/auth-busy-desktop.png)、[模拟登录错误](after/auth-error-mobile.png)、[小屋暗色引导焦点](after/onboarding-cottage-dark-desktop.png)          |

四主题的深浅色代表图位于 `themes/theme-desktop-{blue,anya,cottage,classic}-{light,dark}.png`。`anya`是安雅粉色主题的代码值。主题切换同步实际偏好存储与React状态，包含对应主题的组件分支。

## 已知功能回归的定向补拍

首轮完整84项清单保留不变。随后Axe与状态门禁发现并修复外观卡说明文字对比、当前导航hover覆盖、绘制mode缺少选择语义，以及到时计时器“延长”小字对比；本次仅补拍相关页面，不扩展审美审查。补拍开始于2026-11-19T07:55:09.817Z，共47条唯一页面记录（首批45张，随后仅替换两张设置概览并新增两张行焦点图），桌面1280×900和手机390×844、同一虚构数据与固定日期。设置行说明的单独补拍开始于2026-11-19T08:01:32.399Z；各条记录保留实际批次时间。逐图来源见[功能补拍清单](functional-update-manifest.json)；索引中被替换图的previousEvidence保留上一版hash与来源，原84张本地PNG未覆盖。认证、同频与原生材料仍使用此前已验证批次，不冒充此次重新运行。

主首页初始DOM与首轮清单逐字段比较相同，包含任务、统计、主题和viewport；所有新增选择操作均发生在主图之后。新增实际状态图包括当前导航hover与键盘焦点、已选荧光笔、已选主题/字体说明，以及已到时“延长”。截图只表示最终可见状态，不替代门禁中default/hover/pointerdown/up/keyboard与Axe的断言。

| 状态             | 桌面                                                               | 手机                                                              |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 当前导航hover    | [桌面](after/home-current-navigation-hover-desktop-blue-light.png) | [手机](after/home-current-navigation-hover-mobile-blue-light.png) |
| 当前导航键盘焦点 | [桌面](after/home-current-navigation-focus-desktop-blue-light.png) | [手机](after/home-current-navigation-focus-mobile-blue-light.png) |
| 荧光笔选中       | [桌面](after/home-annotation-selected-desktop-blue-light.png)      | 窄屏现有布局不提供鼠标绘制工具；补拍保留该实际边界                |
| 外观主题说明     | [桌面](after/settings-theme-selected-desktop-blue-light.png)       | [手机](after/settings-theme-selected-mobile-blue-light.png)       |
| 字体说明与焦点   | [桌面](after/settings-font-focus-desktop-blue-light.png)           | [手机](after/settings-font-focus-mobile-blue-light.png)           |
| 设置行说明焦点   | [桌面](after/settings-row-focus-desktop-blue-light.png)            | [手机](after/settings-row-focus-mobile-blue-light.png)            |
| 到时延长         | [桌面](after/timers-expired-desktop-blue-light.png)                | [手机](after/timers-expired-mobile-blue-light.png)                |

## 原生缩放与空图诊断

此前通过的正式8场景矩阵保留全部几何和命中断言，同时改用 Electron44 的 `webContents.capturePage()` 捕获实际可见页面，并拒绝单色或近乎空白的PNG。8个场景均通过，已逐图打开；原生截图的像素尺寸会包含显示器缩放，不能直接当作CSS viewport。

| 请求内容尺寸 | 实际内容尺寸（DIP）                                    | 100% / 125% / 150% / 250% CSS viewport |
| ------------ | ------------------------------------------------------ | -------------------------------------- |
| 1000×600     | 本次独立重跑实际记录1104×624，不能把请求值当作实际尺寸 | 1104×624 / 883×499 / 736×416 / 441×249 |
| 850×500      | 850×562；原生最小尺寸和Windows舍入生效                 | 850×562 / 680×449 / 566×374 / 340×224  |

本次确认额外捕获两张250%原生页面及工作站，不重复整个原生生命周期；实际内容尺寸分别为1000×600和850×562，bounds及可见性见capture-manifest。正式8场景矩阵的窗口全部位于本机实际1152×672 DIP工作区内，显示器 `scaleFactor=2.5`。页面缩放使用 `setZoomFactor(1 / 1.25 / 1.5 / 2.5)`；本批没有切换Windows系统DPI或模拟已完成多块物理屏幕验收。每个场景的实际bounds、可见性及非空像素统计见 [native-zoom-matrix.json](native-zoom-matrix.json)，菜单几何和命中区域由正式脚本逐场景断言。

250%时，同一前台窗口、相同DOM与几何下，Playwright/CDP截图只有1种颜色，Electron原生截图分别有3807和3686种颜色，非主色比例47.2%与46.1%。因此旧空图不能证明产品空白，实际原生画面已确认有内容。对照原图分别为 [CDP空白诊断](capture-diagnostic/cdp-250-blank.png) 与 [同状态原生可见页面](capture-diagnostic/native-250-visible.png)；这一空白图专用于说明截图链差异，不能当作产品视觉证据。

## 查看限制与已知观察

- 多数页面采用fullPage长图；fixed手机底栏或原生标题栏记录的是捕获时的屏幕位置，长图不表示所有内容同时出现在屏幕内，也不能独立证明滚动可达性。
- 最终项目操作菜单与删除确认采用真实viewport截图，分别表示非阻断命令与必要的破坏性操作确认。
- 环图和任务列表有独立滚动区域，当前图只表示当时可见的部分；零预计、未知预计、完整任务以及输入等价性由真实交互测试另行验证。
- 首轮Edge双密码图标已在本次唯一确认回合修复；保留的首轮问题图仅作修复对照，不能当作最终界面。
- main baseline使用development服务，最终主要页面使用production Preview；主首页初始条件已核对，其余图按特定交互状态记录。这里不采用像素金图，也不虚构main基线的手机前后对照。
- 捕获批次关闭了自己的专用fixture与临时Electron进程，并保留主任务32103生产Preview；最终验收结束后由主任务关闭32103。其它任务的服务未被停止。
