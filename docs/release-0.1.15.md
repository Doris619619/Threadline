<!-- 文件用途：记录 0.1.15 的计时统计、计时站、审计修复和生产迁移及安装包验收边界。 -->

# Threadline 0.1.15

- 包含已经合并的 #58、#59，以及 #60 的并行计时统计与 Windows 计时站。
- 并行时段总量去重、分布均分，原始分钟和历史记录保留。跨午夜按启动时区拆分，暂停和等待续时不计入；手动补录及旧记录继续按原值处理。
- 完整工作台、工作站和计时站互斥；计时站通过文字按钮返回完整工作台，切换与关闭不停止计时。
- 计时站支持横纵排列、置顶和边框调整。最窄 200 DIP，窄窗标题栏分两行，卡片完整适配；拖动结束自动收掉底部空白，两种排列分别记忆。
- 发布审计修复了两处问题：无项目 Daily 导致“结束今天”项目汇总失败；窄窗续时选项横向溢出。两者都有实际失败复现和针对性回归。

## 数据与发布顺序

先部署 `202610160001_timer_overlap_accounting.sql`，再合并发布客户端。迁移新增会话表、账号隔离统计投影与原子 RPC，保护已经保存的原始分钟；Daily 继续独立统计，旧账本和收尾快照不回填。发布前 dry-run 确认关联生产库只缺此项迁移。生产部署结果在本轮完成后补记。

## 验证

本轮检查包含 lint、TypeScript、覆盖率、SQL 静态合同、隔离 PostgreSQL 回归，以及 Electron 原生窗口和计时操作。最终合并要求 #60 同一提交的 Web、Preview、Supabase 和 Windows Electron CI 均通过。

计时站验收覆盖一至三张卡片、200/240/339/340 DIP、横纵切换与尺寸记忆、跨窗口暂停/继续、倒计时续时、完成幂等、返回工作视图、最小化、关闭、重载和显示器恢复。尺寸验收检查真实原生最小限制并模拟拖动事件，不冒充物理鼠标、多屏拔插和 NSIS 升级验收。

正式 tag 必须匹配 `package.json`，Release workflow 先验证 Preview/package-dir parity，再使用生产云配置构建 NSIS 安装器。上传草稿后重新下载校验，全部一致才公开；实际流水线结果见 [Release Actions](https://github.com/Doris619619/Threadline/actions/workflows/release.yml)，公开资产见 [0.1.15](https://github.com/Doris619619/Threadline/releases/tag/v0.1.15)。本说明不提前声称安装包已公开。

## 材料

- [并行计时统计](timer-accounting.md)、[计时站](timer-station.md)、[生产配置](supabase-deployment.md)。
- [240 DIP 窄窗截图](screenshots/timer-station/narrow-240.png)和[500 DIP 双卡截图](screenshots/timer-station/two-cards-500.png)来自隔离示例数据。
- 自动化不能替代用户实体设备的安装升级、自启动、多屏拔插和 iPhone PWA 验收。
