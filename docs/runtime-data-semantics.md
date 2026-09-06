<!-- 文件用途：说明 Threadline Supabase 日期/时间、云端真源与设备本地状态的稳定语义。 -->

# 运行时数据语义

## 本地业务日期

任务日期、Daily、收尾、历史目标日期和回收站恢复使用 `src/lib/local-date.ts`。

Insights 与报告不分别计算统计，而是通过 `src/lib/analytics.ts` 的纯函数结果读取；日期范围、周一周起点和月历网格由 `src/lib/date-range.ts` 负责。旧 CloseRecord 只能作为项目级 `legacy-aggregate`，不得由当前任务状态、更新时间或移期字段反推任务级历史。完整质量规则见 [工作台信息架构与分析口径](workspace-information-architecture.md)。

- `getLocalDateKey()` 读取用户本地的年、月、日，不能用 `toISOString().slice(0, 10)` 生成业务日期。
- 相邻日期必须经 `addLocalDateDays()` 计算，避免 UTC 和本地午夜边界混用。
- 时间戳字段（例如 `updatedAt`）仍可使用 ISO instant；只有业务日键必须使用本地日期 helper。
- Records 与 History 从 timestamp 展示日期时使用 `getLocalDateKeyFromTimestamp()`；不得以字符串截取 ISO 的 UTC 日期。

数据库类型边界：

- 业务日期使用 PostgreSQL `date`。
- 计划开始/结束使用 `time`，按用户本地墙钟解释。
- 待安排任务以 `status=waiting` 和 `importance=important|normal` 持久化；它们没有旧到期字段、日期或起止时间，但允许独立可空的 `planned_duration_minutes`，所有任务流转都保留它。
- created/updated/completed/deleted/abandoned/recorded 等审计时间使用 `timestamptz`。
- `src/lib/supabase/time-mapper.ts` 显式映射以上类型；业务 date/time 不调用 `Date`。

生理期起止使用独立的 `period_records` 日期字段；天数包含起止当天，允许同日、跨月和跨年。数据库按 Asia/Shanghai 的业务日拒绝未来记录，通过账号与闭区间的 GiST 排他约束阻止重叠和双进行中记录。

## 云端与本地状态

Supabase 是 Project、Task、Daily template/entry/history、HistoryEvent、CloseRecord、Workstation 和 Rhythm 的 authoritative source of truth。运行时使用 owner-scoped RLS、React Query、server-returned row、Realtime invalidation 和 reconnect refetch；第一版采用 last-write-wins，没有 version/expectedVersion、冲突拒绝 UI、通用串行写队列或离线写队列。

只有 Annotation、highlight color、Electron 窗口 geometry 等设备/UI 状态继续使用 `usePersistentState`。显式 `NEXT_PUBLIC_THREADLINE_TEST_ADAPTER=true` 只用于 Playwright/Electron 自动化，Vercel 禁止启用；缺少云配置不会自动切换该适配器。

Daily 完全不属于 Project，旧 `legacy_project_id` 只用于历史兼容，新的 template、entry 与 history 不写项目绑定。Daily template 与日期 entry 是不同身份：`daily_entries.id` 是日期实例 UUID，`template_id` 指向长期身份；UI mapper 仍让 `Daily.id` 表示 template UUID，并把 entry/item UUID 保存在内部字段。某日第一次读取会幂等 materialize 当前 active template snapshot；模板的名称、清单结构、计划分钟及归档只影响未来实例，既有日期 entry/history 不会被覆盖。Daily 的实际投入仅贡献全局 Daily/总实际，不进入项目汇总或项目热力。

## 首页 Daily 执行与待安排分组

- `isDailyCompleted` 统一采用父级直接完成或任一子项完成。子项取消后按剩余子项重新判断；父级取消同时清空全部子项勾选，不清空分钟与结果。每天只计算一次 Daily，下一天实例重新开始。
- 首页 Daily 使用与项目页一致的父级标题、浅底内嵌清单和分隔线。预计分钟在名称下方，实际分钟在右列编辑，空值提示“填写”；至少有一项输入时父级才显示实际汇总。没有子项的实例可直接填写父级实际。移除“记录／已记录”和“今日结果”UI；已有 result 与旧父级额外分钟继续保留，不变更数据库字段或清理历史。
- iPhone 耗时与收尾表单使用至少 16px 字号和 44px 命中区域，长任务名换行。日程的项目标签位于任务名称前、同行展示，时间、预计和实际分钟独立成第二排，实际未填写时用“记耗时”按钮进入编辑；收尾原生 dialog 显式居中并约束动态视口，只有内容区滚动，页脚按钮始终可见。选择“指定日期”才出现日期输入；明天、待安排和放弃沿用原 FormData 命令，取消与关闭按钮不提交。
- `DailyExecutionRow` 与 `useDailyExecution` 管理单个实例草稿；输入失焦保存，复选框直接保存；“结束今天”通过 DailyPanel 的 flush 屏障等待全部最新草稿成功保存，失败保留行内错误并阻止打开收尾；正式记录由现有收尾命令生成，首页不再单独调用 recordDaily。`saveDailyEntry` 返回 Promise，父子字段由 `save_daily_entry_bundle` 原子保存。草稿在失败和后台刷新时保留，执行区提供重试。已有正式历史仍保留记录时的快照，本次不回写历史。
- 待安排两组和添加入口常显。快速创建草稿携带 `importance`，普通/重要由入口指定；编辑重要性只改变同一任务的分类，不复制任务、不改变排程或历史实际投入。
- 云端必须包含 `202609040001_waiting_task_pool.sql` 和 `202609050001_daily_completion.sql`。前者先移除旧状态约束，再转换旧待办，最后建立新约束；否则包含旧无时间待办的数据库会因不认识 `waiting` 而迁移失败。部署前备份并核对转换范围，部署后核对迁移、任务和历史账本，禁止 reset。

生理期使用独立仓储与查询键，不进入任务工作区或 analytics。保存和软删除等待返回确认；离线立即报错而不排队。云端加载失败可以重试，Preview 也等待本地持久化确认并保留失败输入。新客户端要求先部署 `202609050002_independent_task_estimates.sql` 与 `202609050003_period_records.sql`，实际影响见 [迁移与验收](task-estimates-and-periods.md)。

## 日期化批注

批注由专用的 `useAnnotationStrokes` 管理，使用 `threadline.annotations.v2`，不创建 Supabase annotation table 或 Realtime。日期笔迹必须携带 `targetDate`，全局笔迹明确使用 `targetScope: 'global'`；两种笔迹都保留可选的 `targetTaskId`。

首次升级只在 v2 不存在时读取 v1：旧 `today` 笔迹迁移到升级当天的本地日期，旧 `global` 笔迹保持全局。v1 key 不删除，且迁移不会把笔迹复制到其他日期。

任务进入 `trashed` 时立即清除本设备关联 stroke。设备重连后用 owner 的 authoritative all-task identity set 对账：task 已是 trashed 或已被 30 天物理 purge 时删除 stroke；绝不能用单日或单状态局部查询判断“不存在”。

规划使用普通任务的当前日期与完成状态，不使用投入热力口径；改期以客户端 IANA 时区校验今天及未来目标，三参数旧入口按 UTC 兼容。历史与投入账本保持原归属。
