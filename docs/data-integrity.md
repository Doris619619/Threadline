<!-- 文件用途：说明 Threadline 云端写入、Daily 模板和实际耗时历史的持久化边界。 -->

# 数据完整性规则

## 写入确认

任务与项目创建均以 Supabase 返回的记录为成功条件。新增行、紧凑 Today 和任务弹窗在写入拒绝时保留用户输入并显示错误；只有成功后才清空草稿或关闭界面。新项目必须先持久化，再允许任务引用其 ID。

## Daily

“编辑 Daily”修改长期 `daily_templates` 与 `daily_template_items`，因此未来第一次实例化会使用新名称、项目和子项。已生成日期的 `daily_entries` 是 snapshot，不会被模板编辑污染。日期实例的父级与全部子项通过一个 RPC 一起保存，任一子项无效时整次写入回滚。

Daily 父级完成与子项完成是独立状态；总实际耗时统一为父级 actual 加全部 child actual，并用于首页、history、收尾和 analytics。

## 实际耗时与历史

`tasks.scheduled_date` 可以改变，但 `task_time_entries` 将实际投入固定到写入时的业务日。迁移会从有日期的旧 aggregate 回填；原本没有业务日期的旧 actual 保持不可精确归因，绝不猜测日期。任务完成/重新打开由数据库触发器在同一事务附加正式 history event。
