<!-- 文件用途：说明 0.1.14 的倒计时续时、启动与时间界面修正、已验证源码基线及安装包发布门禁。 -->

# Threadline 0.1.14

- 倒计时到零后点击「延长」，可直接追加 5、10、15 或 30 分钟，也可自定义 1—1440 的整数分钟。桌面使用紧凑浮层，手机使用底部面板；Enter 确认，取消、Escape 或点击外部保留到时状态。
- 续时保留同一个计时器的累计耗时、首次开始时刻和原记账日期；到时后的等待时间不入账，可多次续时。延长本身不改任务预计或实际账本，完成按钮仍统一记录累计实际并完成任务。尚未到时、正计时或待保存的计时不能延长，旧标签的操作不会覆盖其他标签已恢复或待保存的最新状态。
- Windows 在启动加载期间和显示窗口前校正尺寸与位置；完整窗口和工作站跨不同 DPI 屏幕时核对最终原生尺寸，避免窗口放大后右上角控制按钮落到工作区外。
- 登录读取个人设置和本机自启动状态时保留同一加载页，确认需要首次引导或读取失败后才显示相应页面，保留错误重试与退出账号入口。
- 经典与新版圆环的中心标题和时长保留内圈留白，零值只显示口径与 `0min`，外侧任务名和时长用不同颜色、字重区分。日程表头、已有行与新增行共用列宽和完整行背景；桌面输入保持同排等高，紧凑项目列保留名称空间，窄面板可局部横滚，手机保留触控尺寸。

## 源码基线与数据边界

本版本仅收录已合并的 [PR #56](https://github.com/Doris619619/Threadline/pull/56)，业务基线为 `37f27e883e440dcde655dfe44d1acdc37f4bcced`（`37f27e8`）。发布准备递增版本号并同步说明，不另改业务实现。0.1.13 的发布说明保留原有历史记录。

没有新增数据库迁移、账号策略或后台任务。仍需已有的阶段估时和实际记账迁移；2026-10-09 发布准备已复核关联生产库 dry-run，结果为 `upToDate`，没有待应用迁移。续时沿用原本机账号隔离与多标签同步，完成继续使用原 Task 与按日账本的原子保存命令。

## 已通过的源码验证

合并业务基线的 [主线 CI](https://github.com/Doris619619/Threadline/actions/runs/37595688262) 已完成，Web、Preview 演示、Windows Electron 与真实 Supabase 四项全部通过。覆盖单元/组件及覆盖率、生产构建、浏览器交互和布局、数据库合同、原生窗口与 packaged smoke。

回归包含重复续时、等待空档排除、自定义与取消、旧标签最新状态保护、登录慢读与错误出口、圆环窄屏和文字放大、紧凑日程列对齐，以及启动工作区变化和跨 DPI 原生尺寸修正。这是已合并源码的验证记录，不作为 0.1.14 新安装器已构建或已公开的证明。

## 安装包发布门禁

版本提交检查通过并合并后，在同一提交创建与 `package.json` 一致的 `v0.1.14` tag。正式 [Release workflow](../.github/workflows/release.yml) 先通过 lint、类型、单元测试与 Preview/package-dir parity，再使用生产云配置构建 NSIS 安装器。

预期资产为 `Threadline_0.1.14_x64-setup.exe`、对应 `.blockmap` 与 `latest.yml`。发布脚本要求干净的匹配 tag 构建，核对安装器和更新元数据的版本及校验值；上传草稿后重新下载逐字节比较，全部一致才公开。版本提交、安装器和公开资产的完成状态以对应流水线和 [0.1.14 Release 页面](https://github.com/Doris619619/Threadline/releases/tag/v0.1.14) 为准，本文不提前记为通过。

## 设备验收边界与材料

浏览器和 Electron 自动化不替代新安装版在用户设备上的真实开机自启动、实体多屏拔插与缩放、NSIS 安装/卸载或从旧安装版升级，也不代表实体 iPhone Safari/PWA 和软键盘验收。这些设备操作仍需人工验证。

- 实现与回归：[阶段计划与续时](stage-plans.md)、[启动恢复](startup-recovery.md)、[跨显示器恢复](desktop-window-modes.md#跨显示器恢复)、[Windows 构建](WINDOWS_BUILD.md)。
- 隔离演示截图：[桌面续时](screenshots/countdown-extension-20261007/desktop.png)、[自定义续时](screenshots/countdown-extension-20261007/desktop-custom.png)、[320px 手机面板](screenshots/countdown-extension-20261007/mobile.png)、[圆环空态](screenshots/startup-ui-20261007/ring-empty-dark.png)、[日程对齐](screenshots/startup-ui-20261007/schedule-inline-classic.png)。
