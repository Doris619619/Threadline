<!-- 文件用途：记录并行计时在 Preview 桌面、320px 与 iPhone WebKit 的可复现浏览器验收材料。 -->

# 并行计时验收截图

来自 `pnpm test:preview e2e/ui-task-time.spec.ts --grep 'saved overlapping timers'`，均为隔离演示数据。

- [桌面](desktop.png)：任务原始 90/60/30 分钟保留，首页与圆环总量 90，分布 55/25/10。
- [320px 手机](mobile-320.png)：相同统计、长任务名称及说明不产生横向溢出。
- [iPhone WebKit](iphone-webkit.png)：相同流程、完成与刷新后持久化；浏览器模拟不代表实体 iPhone 验收。

本轮不构建或发布正式安装包，未来设备升级验收另行执行。
