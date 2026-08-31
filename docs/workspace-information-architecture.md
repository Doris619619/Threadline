<!-- 文件用途：定义当前 Threadline 七项工作台信息架构、统一 analytics 口径、历史质量边界与报告导出职责。 -->

# 工作台信息架构与分析口径

## 导航与范围

完整工作台使用：首页、日历、项目、洞察、记录、节律、设置。桌面端显示侧栏；移动端固定显示首页、日历、项目、洞察，并通过“更多”进入记录、节律和设置。

- **首页**保留今日日程、Daily、待安排和每日收尾。
- **日历**展示“项目投入热力”：某日热力数等于 `actualMinutes > 0` 的去重项目数，映射为 `0 / 1 / 2 / 3 / 4+`。它不使用完成任务数量；周一开头，选择日期、跨月补齐格与“今天”会同步当前可见月份。
- **洞察**提供日、周、月和自定义范围的项目投入、预计与实际、投入趋势、项目重心与浏览器/Electron 报告导出。
- **记录**只搜索当前可靠可得的 Task、HistoryEvent、DailyHistory 与 CloseRecord；它不是 Event Sourcing。
- **节律**是账号级同步的日期标记，默认不进入 analytics、PDF 或记录搜索。
- **设置**提供只读账户摘要、Cloud 与本地边界、隐私、回收站和关于信息；“桌面窗口”与重置位置只在 Electron bridge 存在时可见。它不伪造主题、密度、默认项目、同步进度等偏好。

## 统一 analytics

`src/lib/analytics.ts` 是 Calendar、Insights 和报告数据的唯一计算入口，使用 `LocalDateKey` 与 `src/lib/date-range.ts` 的周一范围规则。

数据质量严格区分：

| 质量               | 含义                                 | 处理                             |
| ------------------ | ------------------------------------ | -------------------------------- |
| `exact`            | 来源本身同时具有业务日期、项目和分钟 | 参与精确项目与日期汇总           |
| `legacy-aggregate` | 旧 CloseRecord 只有某日项目总分钟    | 仅保留为项目级汇总，不拆分为任务 |
| `incomplete`       | 缺少明确业务日期或无法确认归属       | 不伪造历史，洞察与报告显示提示   |

History / Records 的正式 Daily 历史只来自 `daily_history_entries`。Calendar、Insights 与 PDF 同时读取正式 Daily history 和尚未正式记录的 `daily_entries`，按 `(template_id, entry_date)` 去重；因此未点击“记录”的当日实际耗时仍会立即进入洞察。同日同项目已有精确来源时，adapter 完全跳过 CloseRecord；不会用 CloseRecord 减去 Daily、更新时间、当前状态或移期字段推断历史。

## 状态边界

`WorkspaceDataProvider` 通过细粒度 Supabase Repository 与 React Query 协调任务、项目、Daily、历史和工作站。普通单表字段直接 CRUD；task transition + history、close_day、Daily template + 当前 entry、完整 workstation reorder 使用小型事务 RPC。节律由独立 `RhythmStateProvider` 订阅 Supabase，但仍不进入 analytics。

启动时，`StartupProgressProvider` 只聚合状态：认证运行时的 `getSession()` 与 `initializeWorkspace()` 分别驱动前两阶段；`WorkspaceDataProvider` 的八组 query 加 Annotation/高亮本机 hydration 驱动“加载工作区数据”；同一 Provider 的 `workspace:${ownerId}` channel 仅在 Supabase 报告 `SUBSCRIBED` 后完成“开启实时同步”。数据 hydration 成功即允许工作台使用；Realtime 的 `CHANNEL_ERROR`、`TIMED_OUT` 或非清理中的 `CLOSED` 会保留失败状态并显示非阻塞提示，绝不被映射为已订阅。

Task 的 `abandoned` 是永久保留的业务历史状态；`purged` 不是 TaskStatus。只有 `trashed + deleted_at 超过 30 天` 才由受保护的数据库函数物理删除。History FK 不级联删除 task history，并保存标题/项目/日期 snapshot。旧业务 localStorage key 在云账号初始化后清理，不迁移旧数据。

## 报告导出

报告固定由 `AnalyticsResult → ReportData → ReportDocument` 构建；`report-builder.ts` 是中间的纯数据映射层，专用报告 DOM 不复用交互式 Insights UI。

- Web/PWA 使用浏览器 `window.print()`。
- Electron 仅给 Main Renderer 暴露 `exportReportPdf` bridge；Main 校验可信 sender 与 `main` role，弹出保存对话框，再对当前 document 的打印专用报告 DOM 调用 `webContents.printToPDF`。
- Edge 窗口不暴露 PDF bridge。Main/Preload 保持 CommonJS，窗口 geometry、stateRevision、single-instance 与 CSP 边界不因报告导出而改变。
