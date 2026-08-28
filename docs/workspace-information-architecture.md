<!-- 文件用途：定义当前 Threadline 七项工作台信息架构、统一 analytics 口径、历史质量边界与报告导出职责。 -->

# 工作台信息架构与分析口径

## 导航与范围

完整工作台使用：首页、日历、项目、洞察、记录、节律、设置。桌面端显示侧栏；移动端固定显示首页、日历、项目、洞察，并通过“更多”进入记录、节律和设置。

- **首页**保留今日日程、Daily、待安排和每日收尾。
- **日历**展示“项目投入热力”：某日热力数等于 `actualMinutes > 0` 的去重项目数，映射为 `0 / 1 / 2 / 3 / 4+`。它不使用完成任务数量。
- **洞察**提供日、周、月和自定义范围的项目投入、预计与实际、投入趋势、项目重心与浏览器/Electron 报告导出。
- **记录**只搜索当前可靠可得的 Task、HistoryEvent、DailyHistory 与 CloseRecord；它不是 Event Sourcing。
- **节律**是仅本地的私密日期标记，默认不进入 analytics、PDF 或记录搜索。
- **设置**第一版只提供数据回收站、隐私边界、桌面窗口重置和关于信息；不伪造主题、密度、默认项目等偏好。

## 统一 analytics

`src/lib/analytics.ts` 是 Calendar、Insights 和报告数据的唯一计算入口，使用 `LocalDateKey` 与 `src/lib/date-range.ts` 的周一范围规则。

数据质量严格区分：

| 质量               | 含义                                 | 处理                             |
| ------------------ | ------------------------------------ | -------------------------------- |
| `exact`            | 来源本身同时具有业务日期、项目和分钟 | 参与精确项目与日期汇总           |
| `legacy-aggregate` | 旧 CloseRecord 只有某日项目总分钟    | 仅保留为项目级汇总，不拆分为任务 |
| `incomplete`       | 缺少明确业务日期或无法确认归属       | 不伪造历史，洞察与报告显示提示   |

当同日同项目已有精确来源时，adapter 完全跳过 CloseRecord；不会用 CloseRecord 减去 Daily、更新时间、当前状态或移期字段推断历史。

## 状态边界

`WorkspaceDataProvider` 只协调 hydration 和领域 Context：任务、项目、Daily、历史、工作台表面状态。每个领域都有独立 State 与 Actions Context；analytics 和报告不进入 Provider。节律状态由独立 `RhythmStateProvider` 管理，因此不会被工作台 analytics 读取。

本轮仍使用既有 Task / Daily / History / CloseRecord 数据模型；没有引入 TimeRecord，也没有迁移或删除旧 storage key。若未来确认 TimeRecord，必须先建立单一领域 action 与原子版本化存储，再考虑将其升级为实际投入的唯一来源。

## 报告导出

报告固定由 `AnalyticsResult → ReportData → ReportDocument` 构建；`report-builder.ts` 是中间的纯数据映射层，专用报告 DOM 不复用交互式 Insights UI。

- Web/PWA 使用浏览器 `window.print()`。
- Electron 仅给 Main Renderer 暴露 `exportReportPdf` bridge；Main 校验可信 sender 与 `main` role，弹出保存对话框，再对当前 document 的打印专用报告 DOM 调用 `webContents.printToPDF`。
- Edge 窗口不暴露 PDF bridge。Main/Preload 保持 CommonJS，窗口 geometry、stateRevision、single-instance 与 CSP 边界不因报告导出而改变。
