<!-- 文件用途：记录计划/习惯界面精修、项目菜单和跨屏修复的实现与验证边界。 -->

# 计划与习惯界面精修

以用户 P1/P6 为布局方向，优先整齐、克制和可读性。当前皮卡经典整体改为暖白纸面，控件/内容卡片/弹窗分别为 8/10/16px 圆角，金棕色用于交互状态；保留已有字体、人物和装扮。其他主题保留语义色与图标。

项目菜单使用浏览器 Popover API 顶层绘制，DOM 仍留在所属对话框中；选项由调用方按现有业务规则过滤，受控项目 ID 与 FormData 字段保持兼容。超过七项显示搜索，关闭菜单不提交表单。项目草稿和菜单具有独立状态，不增加数据库字段。

习惯页在所有主题下统一展示今日习惯、统计概览、双趋势图和每日状态面板；桌面打卡与指标各为三张等宽卡片，内容最大宽度 1440px，手机顺序堆叠。结构规则不绑定主题，深色小屋也使用同一布局，颜色与字体仍遵守用户偏好。仍默认本周，月视图按周一到周日对齐；顶部日期只控制记录，不改变统计范围。缺失数据不补零，已有保存/重试、时区和版本校验继续使用原实现。

窗口策略与原生事件修复单独提交。完整窗口拖回小屏后限制到可用工作区，坐标始终使用 DIP，不乘除缩放因子；在最大化/最小化状态不保存异常位置。

「结束今天」位于首页顶部统计面板内部的右侧操作区，以细分隔线区分，保留正常按钮高度并与指标垂直居中；不再在统计卡片外单独留出一块按钮空位。手机与今日任务摘要同组，空间不足自然换行。所有主题采用中性底色、轻边框和月亮图标。点击仍先等待 Daily 草稿保存，再打开原收尾确认；保存中禁用入口，收尾成功后显示勾选图标与「今日已结束」，业务规则不变。

计划页删除页标题下的介绍文案；习惯页删除今日习惯的说明及统计区常驻口径小字，保留目标、记录数量及必要异常提示。日期、时钟和时区放在「习惯」标题右侧同排，手机窄屏自然换行。统计计算与账号时区语义保持不变。

本轮进一步收紧比例后，五组习惯布局与六项收尾浏览器回归重新通过，新增标题/时钟同排、面板内按钮右侧留白及垂直居中断言；lint、typecheck 和 Web 构建通过。localhost 使用当前产物；Electron 打包预览仍对应构建清单所记录的 `7b8df12`，未包含本轮页头与操作区微调。

## 参考

- [WAI-ARIA 组合框键盘规范](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Popover API 顶层与关闭行为](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using)
- [Electron 44 screen](https://github.com/electron/electron/blob/v44.0.0/docs/api/screen.md)
- [Electron 44 BrowserWindow](https://github.com/electron/electron/blob/v44.0.0/docs/api/browser-window.md)

## 验证

- `pnpm lint`、`pnpm typecheck` 与全量 `pnpm test`（91 个文件、460 项通过）；CSS token 合约、阶段失败重试及中文输入法行为一并检查。
- Chromium 桌面/手机及 iPhone WebKit 的习惯、阶段业务与精修用例；1280/1440 桌面、320/390 手机、四种主题、明暗模式和 200% 字号的布局、对比度与溢出检查。
- 全主题卡片修正后，`e2e/ui-habits.spec.ts` 的五组浏览器检查通过：逐一断言面板背景/边框、打卡与指标卡片的实际位置和等宽、宽屏内容宽度，并保留每种主题明暗截图，避免只有无溢出检查却漏掉旧布局。lint、typecheck 与两项 CSS token 合约重新通过。
- 顶部收尾入口检查覆盖四主题明暗配色、首屏位置、320px 同排、200% 字号、键盘取消与焦点返回；桌面、320px 手机和 iPhone WebKit 共六项浏览器用例通过，含 Daily 校验失败阻止收尾、保存成功及移期。另有四文件十五项收尾/Daily/token 回归通过，lint 与 typecheck 通过。
- `pnpm test:preview`：隔离演示的 18 个用例，覆盖长草稿、逐项项目归属、任务表单、Daily 保存/展开、聚焦日期和错误后保留草稿。旧原生下拉/标题定位改为当前控件与实际周期断言，失败用例修正后单独复测。
- Web production 构建和 CSP 边界、Electron 静态导出与 Main/Preload 编译通过。原生窗口 smoke 覆盖切换、最大化、重启、Edge 及登录竞态；新增真实 BrowserWindow + 模拟 screen 参数的跨屏松手和工作区缩小测试，测试后恢复 screen 方法。
- 纯策略覆盖负屏幕坐标、局部可见的超大窗口及 100% / 125% / 150% / 200% 的逻辑工作区。物理 Huawei 外屏与笔记本实际拖动仍需设备复验，自动化不能代替它。

隔离测试数据与本地预览不代表生产发布。网络失败的稳定 ID 与草稿保留由组件测试覆盖；错误截图展示日期验证失败，不伪造网络故障。

实际预览 EXE 另经 `pnpm test:electron:packaged` 验证图标、受限静态协议、CSP、动态页面、习惯记录保存与关闭行为。

## 截图与本地交付

截图使用隔离数据；保持原有字体设置，没有修改生产账户。另有 [阶段空态](screenshots/ui-polish/desktop-plans-empty-stage.png) 与 [习惯空态](screenshots/ui-polish/desktop-habits-empty.png)。

全主题布局验收新增 [深色小屋桌面](screenshots/ui-polish/desktop-habits-cottage-dark.png) 与 [320px 手机](screenshots/ui-polish/mobile-320-habits-cottage-dark.png)，对应四主题矩阵的隔离打卡数据。

顶部收尾入口：[桌面浅色](screenshots/ui-polish/desktop-close-day-overview.png)、[桌面深色](screenshots/ui-polish/desktop-close-day-dark.png)、[320px 手机](screenshots/ui-polish/mobile-close-day-overview.png)。

| 页面       | 桌面                                                                                                                 | 手机                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 计划       | [浅色](screenshots/ui-polish/desktop-plans-light.png)                                                                | [浅色](screenshots/ui-polish/mobile-plans-light.png)           |
| 习惯       | [浅色](screenshots/ui-polish/desktop-habits-light.png)、[深色](screenshots/ui-polish/desktop-habits-dark.png)        | [浅色](screenshots/ui-polish/mobile-habits-light.png)          |
| 项目菜单   | [展开](screenshots/ui-polish/desktop-project-menu.png)                                                               | [展开](screenshots/ui-polish/mobile-project-menu.png)          |
| 阶段编辑   | [清单](screenshots/ui-polish/desktop-stage-editor.png)                                                               | [清单](screenshots/ui-polish/mobile-stage-editor.png)          |
| 日期与错误 | [聚焦](screenshots/ui-polish/desktop-date-focus.png)、[错误保留](screenshots/ui-polish/desktop-validation-error.png) | [320px](screenshots/ui-polish/mobile-320-validation-error.png) |

本地交互预览：`http://127.0.0.1:3103`，进入「习惯」即可查看新布局，无需切换主题；皮卡经典浅色对应暖白视觉参考。生成预览时没有 Supabase 配置，仅使用隔离演示数据。

前后对比在 `.tmp/ui-polish-review/index.html`，其中原始截图只留在本机，不提交用户截图。Electron 本地预览输出为 `release/preview/win-unpacked/Threadline.exe`，构建清单为 `release/preview/build-manifest.json`；本次使用显式 test adapter，需用独立 `--user-data-dir` 打开，不能当作正式升级安装包发布。
