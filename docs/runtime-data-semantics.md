<!-- 文件用途：说明 Threadline Supabase 日期/时间、云端真源与设备本地状态的稳定语义。 -->

# 运行时数据语义

## 本地业务日期

任务日期、Daily、收尾、历史目标日期和回收站恢复使用 `src/lib/local-date.ts`。

Calendar、Insights 与报告不分别计算统计，而是通过 `src/lib/analytics.ts` 的纯函数结果读取；日期范围、周一周起点和月历网格由 `src/lib/date-range.ts` 负责。旧 CloseRecord 只能作为项目级 `legacy-aggregate`，不得由当前任务状态、更新时间或移期字段反推任务级历史。完整质量规则见 [工作台信息架构与分析口径](workspace-information-architecture.md)。

- `getLocalDateKey()` 读取用户本地的年、月、日，不能用 `toISOString().slice(0, 10)` 生成业务日期。
- 相邻日期必须经 `addLocalDateDays()` 计算，避免 UTC 和本地午夜边界混用。
- 时间戳字段（例如 `updatedAt`）仍可使用 ISO instant；只有业务日键必须使用本地日期 helper。
- Records 与 History 从 timestamp 展示日期时使用 `getLocalDateKeyFromTimestamp()`；不得以字符串截取 ISO 的 UTC 日期。

数据库类型边界：

- 业务日期使用 PostgreSQL `date`。
- 计划开始/结束使用 `time`，按用户本地墙钟解释。
- `ddl_at` 使用 `timestamp without time zone`，保持 `datetime-local` 原值，不自动转 UTC。
- created/updated/completed/deleted/abandoned/recorded 等审计时间使用 `timestamptz`。
- `src/lib/supabase/time-mapper.ts` 显式映射以上类型；业务 date/time 不调用 `Date`。

## 云端与本地状态

Supabase 是 Project、Task、Daily template/entry/history、HistoryEvent、CloseRecord、Workstation 和 Rhythm 的 authoritative source of truth。运行时使用 owner-scoped RLS、React Query、server-returned row、Realtime invalidation 和 reconnect refetch；第一版采用 last-write-wins，没有 version/expectedVersion、冲突拒绝 UI、通用串行写队列或离线写队列。

只有 Annotation、highlight color、Electron 窗口 geometry 等设备/UI 状态继续使用 `usePersistentState`。显式 `NEXT_PUBLIC_THREADLINE_TEST_ADAPTER=true` 只用于 Playwright/Electron 自动化，Vercel 禁止启用；缺少云配置不会自动切换该适配器。

Daily template 与日期 entry 是不同身份。`daily_entries.id` 是日期实例 UUID，`template_id` 指向长期身份；UI mapper 仍让 `Daily.id` 表示 template UUID，并把 entry/item UUID 保存在内部字段。某日第一次读取会幂等 materialize 当前 active template snapshot；既有日期不会被未来模板修改覆盖。

## 日期化批注

批注由专用的 `useAnnotationStrokes` 管理，使用 `threadline.annotations.v2`，不创建 Supabase annotation table 或 Realtime。日期笔迹必须携带 `targetDate`，全局笔迹明确使用 `targetScope: 'global'`；两种笔迹都保留可选的 `targetTaskId`。

首次升级只在 v2 不存在时读取 v1：旧 `today` 笔迹迁移到升级当天的本地日期，旧 `global` 笔迹保持全局。v1 key 不删除，且迁移不会把笔迹复制到其他日期。

任务进入 `trashed` 时立即清除本设备关联 stroke。设备重连后用 owner 的 authoritative all-task identity set 对账：task 已是 trashed 或已被 30 天物理 purge 时删除 stroke；绝不能用单日或单状态局部查询判断“不存在”。
