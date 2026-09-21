<!-- 文件用途：说明 Threadline 云端写入、Daily 模板和实际耗时历史的持久化边界。 -->

# 数据完整性规则

## 写入确认

任务与项目创建均以 Supabase 返回的记录为成功条件。新增行、紧凑 Today 和任务弹窗在写入拒绝时保留用户输入并显示错误；只有成功后才清空草稿或关闭界面。新项目必须先持久化，再允许任务引用其 ID。

已有任务勾选和普通字段编辑使用即时反馈：`use-cloud-task-updates.ts` 在当前账号内保留待保存意图，后台查询不能覆盖它。同一任务按操作顺序保存，不同任务可并发；确认后仅替换该任务，不用旧整表快照覆盖其他任务。保存失败恢复该任务最后一次已确认状态并提示重试，离线直接拒绝，不建立离线队列。

任务保存与实际账本读取分别确认。任务已提交后，耗时刷新失败只提示同步错误，不把已完成任务恢复为未完成。实际投入仍读取数据库账本，不使用乐观字段制造统计值。此队列只处理普通字段；任务流转和收尾继续走原有原子 RPC。

回归覆盖首次勾选、后台旧读、同任务连续勾选/取消、跨任务乱序返回、失败回滚/重试、账本失败与账号切换。真实本地 Supabase 浏览器测试在 390px 下暂缓任务 REST 写入，断言响应前首次勾选稳定，再验证另一页面 Realtime 和刷新持久化；测试只使用临时账号，不替代真实 iPhone 验收。

## 独立预计与生理期

普通任务复用可空的 `planned_duration_minutes`，仅接受非负整数分钟。新增日程和编辑时间时，有效同日起止范围会自动回填预计，用户仍可手动覆盖；仅编辑标题等无关字段不重算历史预计。转入待安排只清除日期与起止时间，安排、移期、完成与收尾保留预计，已有实际账本不改日、不回填。

`period_records` 使用账号 RLS 与数据库排他约束保护正式生理期记录；软删除释放日期范围，旧 `rhythm_marks` 原样保留。实际记录不允许未来日期、反向日期或重叠；多个客户端同时创建冲突范围时只有一个能成功，失败保留草稿。它是独立私密领域，不参与任务报告或搜索。新增迁移不重写历史数据，部署顺序与验证见 [预计时长与生理期记录](task-estimates-and-periods.md)。

## Daily

Daily 完全不属于 Project。旧记录可保留 `legacy_project_id` snapshot 兼容历史，但新模板、新实例不写 `project_id`，也绝不会投递至 fallback 项目。

创建模板与 0～N 个清单项经 `create_daily_template_with_entry` 单个 RPC 原子提交；名称、计划清单结构与 `planned_duration_minutes` 经 `update_daily_template_bundle` 保存。计划分钟只属于模板/entry snapshot，实际分钟只属于每日执行 entry，二者不能复用。`ensure_daily_entries_for_date` 只从该次 `INSERT ... RETURNING` 的新 entry 复制模板项：重复 materialize 同一天不会回填后来新增的模板项，未来首次 materialize 才采用最新模板结构。模板编辑只影响未来实例，已生成 entry/history 永远保留原 snapshot。

模板及清单项的归档、恢复、软删除使用 owner-scoped RPC。归档 Daily 仍可改名和修改既有清单项，但不能追加新清单项；删除是终态，任何过期客户端的恢复、归档或保存请求都不能令模板或清单项复活。Repository 可以保留 deleted child 以维持历史 identity，但模板管理 payload 必须排除 `deletedAt`，同时保留 archived child。`daily_templates`、`daily_template_items`、`daily_entries` 与 `daily_entry_items` 对 authenticated 仅授予 `SELECT`；其写入仅通过固定 `search_path`、检查 `auth.uid()` 且逐行 owner scope 的 SECURITY DEFINER RPC 完成。归档或删除后未来实例化会跳过对应记录；过去 entry/history 不修改。Daily 实际继续进入全局 Daily/总实际，但不再计入项目统计、占比或热力。

## 实际耗时与历史

`tasks.scheduled_date` 可以改变，但只读的 `task_time_entries` 由数据库触发器写入，将实际投入固定到发生时的业务日。它使用同账号复合外键；任务超过保留期被受信流程物理清理时仅移除 `task_id`，按日分钟与项目归属继续保留。

迁移会在短暂阻止任务写入的同一事务中完成旧数据回填和 trigger 安装，避免并发更新穿过迁移窗口。有日期的旧 aggregate 会回填；原本没有业务日期的旧 actual 保持不可精确归因，绝不猜测日期。没有业务日期时禁止新增实际耗时；减少累计耗时只从当前业务日已经存在的账本份额扣减，份额不存在或不足时整次更新被拒绝，绝不会把 legacy 未归因分钟凭空写到当天。首页、项目页、每日收尾和 analytics 在云端即使账本为空也以它为真源；只有显式测试适配器可以回退到 task aggregate。

每日关账仍接收旧客户端的项目分钟参数以保持 RPC 签名兼容，但数据库在 `daily_close_records` 写入前会忽略该参数，并仅从关账日期的只读任务账本按项目聚合；Daily 实际不再参与项目汇总。

历史上由旧 trigger 写入的 close record 可能已经把项目内 Daily 合计混入 `project_minutes`。`20260830` 至 `20260831` 的短暂版本中，`daily_history_entries` 只保存 Daily 父项，而 close trigger 已聚合父项加子项；因此迁移先检查这类 history：仅当父项仍与 history 一致，且所有子项自记录后均未更新时，才用父子总和补齐旧 close 的 Daily 分量。正式 total history 仍优先于随后被修改的 current entry；没有 history 的旧工作区才回退到 `daily_entries.legacy_project_id` 与父子实际。无法证明 parent-only child snapshot 的行会以 `LEGACY_DAILY_HISTORY_AMBIGUOUS` 使迁移整体回滚，等待人工核对，而不是静默猜测或让 Daily 残留在项目统计。其余可验证行与同日 `task_time_entries` 双重核对，仅扣除 Daily 分量，并在 `daily_close_record_daily_exclusions` 留下审计行；repair 阶段会短暂关闭 close capture trigger 以保留经过核对的 task residual，结束后立即重新开启，所以新 close record 仍由 server-derived trigger 保护。close record、任务残差和项目 identity 均保留。若原始分钟无法证明仍能保留 ledger 对应的任务残差，迁移会以 `LEGACY_CLOSE_RECORD_DAILY_TOTAL_MISMATCH` 停止，而不是静默丢失项目历史或让 Daily 再次进入项目统计。

## 项目归档与删除

项目归档只从 active 选择器中隐藏，任务与历史仍保留。删除使用 `soft_delete_project`：fallback 项目禁止归档/删除但可修改名称和颜色；被删除项目的所有当前 task（包括回收站）原子改派到 fallback 项目，确保恢复后不会重新引用隐藏项目；`task_time_entries`、History snapshot 和旧 Daily snapshot 绝不重写，因此历史项目统计继续准确。云端项目读取自动排除 `deleted_at` 非空的行，刷新后不会重新出现。

任务完成或重新打开由数据库触发器在同一事务附加正式 history event。
