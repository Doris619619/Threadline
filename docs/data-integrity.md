<!-- 文件用途：说明 Threadline 云端写入、Daily 模板和实际耗时历史的持久化边界。 -->

# 数据完整性规则

## 写入确认

任务与项目创建均以 Supabase 返回的记录为成功条件。新增行、紧凑 Today 和任务弹窗在写入拒绝时保留用户输入并显示错误；只有成功后才清空草稿或关闭界面。新项目必须先持久化，再允许任务引用其 ID。

## Daily

Daily 完全不属于 Project。旧记录可保留 `legacy_project_id` snapshot 兼容历史，但新模板、新实例不写 `project_id`，也绝不会投递至 fallback 项目。

创建模板与 0～N 个清单项经 `create_daily_template_with_entry` 单个 RPC 原子提交；名称、计划清单结构与 `planned_duration_minutes` 经 `update_daily_template_bundle` 保存。计划分钟只属于模板/entry snapshot，实际分钟只属于每日执行 entry，二者不能复用。模板编辑只影响未来实例，已生成 entry/history 永远保留原 snapshot。

模板及清单项的归档、恢复、软删除使用 owner-scoped RPC。归档或删除后未来实例化会跳过对应记录；过去 entry/history 不修改。Daily 实际继续进入全局 Daily/总实际，但不再计入项目统计、占比或热力。

## 实际耗时与历史

`tasks.scheduled_date` 可以改变，但只读的 `task_time_entries` 由数据库触发器写入，将实际投入固定到发生时的业务日。它使用同账号复合外键；任务超过保留期被受信流程物理清理时仅移除 `task_id`，按日分钟与项目归属继续保留。

迁移会在短暂阻止任务写入的同一事务中完成旧数据回填和 trigger 安装，避免并发更新穿过迁移窗口。有日期的旧 aggregate 会回填；原本没有业务日期的旧 actual 保持不可精确归因，绝不猜测日期。没有业务日期时禁止新增实际耗时；减少累计耗时只从当前业务日已经存在的账本份额扣减，份额不存在或不足时整次更新被拒绝，绝不会把 legacy 未归因分钟凭空写到当天。首页、项目页、每日收尾和 analytics 在云端即使账本为空也以它为真源；只有显式测试适配器可以回退到 task aggregate。

每日关账仍接收旧客户端的项目分钟参数以保持 RPC 签名兼容，但数据库在 `daily_close_records` 写入前会忽略该参数，并仅从关账日期的只读任务账本按项目聚合；Daily 实际不再参与项目汇总。

历史上由旧 trigger 写入的 close record 可能已经把项目内 Daily 合计混入 `project_minutes`。迁移会用同日 `task_time_entries` 与保留的 `daily_entries.legacy_project_id`/父子实际双重核对后，仅扣除可验证的 Daily 分量，并在 `daily_close_record_daily_exclusions` 留下审计行；close record、任务残差和项目 identity 均保留。若原始分钟无法证明仍能保留 ledger 对应的任务残差，迁移会以 `LEGACY_CLOSE_RECORD_DAILY_TOTAL_MISMATCH` 停止，而不是静默丢失项目历史或让 Daily 再次进入项目统计。

## 项目归档与删除

项目归档只从 active 选择器中隐藏，任务与历史仍保留。删除使用 `soft_delete_project`：fallback 项目禁止归档/删除；被删除项目的有效 task 原子改派到 fallback 项目；`task_time_entries`、History snapshot 和旧 Daily snapshot 绝不重写，因此历史项目统计继续准确。云端项目读取自动排除 `deleted_at` 非空的行，刷新后不会重新出现。

任务完成或重新打开由数据库触发器在同一事务附加正式 history event。
