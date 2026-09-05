<!-- 文件用途：说明独立预计、紧凑任务列表、洞察/设置与生理期记录的实现边界、部署影响和验收证据。 -->

# 预计时长与生理期记录

## 用户规则

预计使用非负整数分钟，允许留空或清空为“待定”，显示为 `45min`、`1h`、`1h30min`。预计与同日的起止时间独立，修改时间不覆盖预计。任务新建、详情、行内预计与迷你今日遵守相同规则。待安排在任务名后显示预计，长标题允许换行；安排、移回待安排、移期、完成、恢复及收尾保留预计。历史实际账本继续使用原来的业务日和项目归属。

手机今日日程使用同一分组内连续双行，普通短标题约 88px；待安排约 52px，空组只保留标题与添加入口。手机输入至少 16px，操作保持 44px 点击区域；不限制页面缩放。桌面保留七列日程以及 Electron 共用前端。

洞察默认本周，提供当天、本周、本月和自定义分段。首先展示实际投入、所选业务日期范围内 active 普通任务完成数/总数、主要投入项目；排除待安排、放弃和回收站任务。每日趋势提供可读取数值，项目按实际时间排序并展示占比；Daily 只进入总实际，不进入项目占比。有效估时比较只使用同时填写预计与实际的普通任务，未填写不视为零；打印报告沿用相同样本口径，实际总量和 Daily 去重仍来自 `analytics.ts`。

设置移除日期切换器，账户摘要保持真实登录身份，分组间距 24px，行高约 56px，解释性文案进入详情；保留同步、隐私、回收站、关于、退出登录与 Electron 专属入口。

节律按当前状态、月历、历史记录组织。可以记录开始、结束、补录、修改和确认删除，日期默认今天并允许修改。天数包含起止当天，支持同日、跨月和跨年。未结束的记录占用开始日之后的日期范围；禁止反向、未来、重叠或两个进行中的记录。统计已结束记录的平均天数，以及相邻开始日期的平均间隔；没有所需样本时明确显示不足。月历保留星期表头、连续范围、起止与今天标识。没有预测、症状、提醒或医疗推断。

## 设计参考

参考 [Apple 健康经期跟踪](https://support.apple.com/zh-cn/120356) 的官方界面：已记录经期有独立的红色语义、日期与记录动作优先、历史保持可浏览。Threadline 用低饱和莓红色与浅色连续范围标示真实记录，深色起止圆点配文字，今天使用独立外圈；顶部显示当前记录状态和最近一次起止信息，月历提供回到本月入口。保留原有蓝色交互色，以免把所有按钮都当作经期数据。

[Clue 官方记录说明](https://support.helloclue.com/hc/en-us/articles/215935063-How-do-I-track-my-period) 也提供从日历日期进入记录的路径，本实现保留点日历查看/补录。没有照搬其逐日流量登记、结束推断、预测或问卷。采用参考中的信息层次，所有界面由共用 React/CSS 实现，不嵌入第三方截图或商标素材。

## 数据和职责

- 任务复用 `tasks.planned_duration_minutes`，不新增时长列；共享解析/显示在 `task-time.ts`，表单在 `planned-minutes-field.tsx`，样式在 `task-estimates.css`。
- `period_records` 包含 UUID、`owner_id`、`start_date`、可空 `end_date`、创建/更新/软删除时间。owner 默认 `auth.uid()`，RLS 强制账号隔离；authenticated 仅获 SELECT/INSERT/UPDATE，没有硬删除权限。
- `(owner_id, daterange(start_date, end_date, '[]'))` 的 GiST 排他约束仅覆盖未软删除记录，因此同日计一天，软删除释放范围，并发重叠只有一方能成功。数据库日期校验以 Asia/Shanghai 业务日为准。
- `period-rules.ts` 管理日期和描述性统计；`period-repository.ts` 负责 RLS 仓储；`rhythm-state.tsx` 管理独立账号查询和 Realtime 失效刷新；`period-editor.tsx` 管理草稿与删除确认。
- 云端保存等待返回确认，离线立即提示并保留输入；加载错误提供重试。Preview 复用相同校验，使用独立存储键并等待实际写入成功，不静默忽略本地存储失败。
- 旧 `rhythm_marks` 不改写、不删除、不自动转换。新正式记录覆盖同日期的月历展示，旧标记不计入经期统计。新旧节律数据均不进入任务洞察、报告和记录搜索。

## 增量迁移与上线顺序

生产本次尚未执行迁移，也尚未发布客户端。执行前应读取实际已部署 migration 清单并说明完整 pending 范围，先确认备份，禁止 reset/bootstrap 或重写历史。

1. `202609050002_independent_task_estimates.sql` 放宽 waiting 状态对预计的限制，替换 `transition_task`、`complete_waiting_task`、`close_day`，仅移除清空预计的赋值。重新校验约束时会扫描 tasks 并短暂阻塞并发写入。没有数据 UPDATE、账本重建或历史回填。
2. `202609050003_period_records.sql` 安装/复用 `btree_gist`，创建独立表、索引、日期触发器、RLS/权限和 Realtime publication。新表初始为空，不触碰旧标记和任务数据。
3. 数据库成功后核对约束、RPC 和权限，再发布 Web/PWA 与 Electron 客户端；用隔离验收账号确认读写和双客户端刷新。旧客户端在编辑任务时仍可能带入旧预计逻辑，因此应及时刷新/升级客户端。

本次真实数据库验证使用额外的 `threadline-period-validation` 本地 Supabase 实例，API 55431、数据库 55432；原有本地 54321/54322 实例与生产均未迁移。新实例从全量 migration 顺序创建，集成测试只创建并清理自己生成的临时账号。

## 验证命令与边界

在已准备好隔离配置的本地工作目录中运行：

```powershell
pnpm exec supabase test db --workdir .tmp/period-db-validation
$env:THREADLINE_SUPABASE_WORKDIR = '.tmp/period-db-validation'
node scripts/test-period-integration.mjs
```

集成脚本只允许 loopback API，验证预计在安排/移期/待安排/完成/收尾中保留、实际账本不变、生理期 CRUD、日期与并发冲突、账号隔离、旧标记保留和另一客户端收到真实 Realtime 事件。数据库 pgTAP 159 项断言已通过。

最终本地结果：45 个单元测试文件、197 项测试全部通过；六种 viewport/浏览器的新增端到端流程 18 项全部通过，普通手机日程实测行高为 88px（375/390/430px，320px 和 WebKit 也为 88px）。320px 月历日期格宽度至少 44px。此前布局矩阵与手机表单回归 27 项通过；最终另跑的现有无障碍与 390px 布局回归 13 项也全部通过，没有放宽 axe 既有基线。类型检查、Lint、SQL 静态合同、Web 生产构建和 Electron 静态前端构建也均通过；构建使用显式测试适配器，不是可发布的生产云配置产物。自动化 E2E 覆盖手机 375/390/430px、320px 兜底、桌面 1440px 与模拟 iPhone WebKit，保留页面截图。测试包含独立预计流转、生理期完整表单、离线失败重试、长标题、范围切换与空数据。最终 390px 页面截图另存于 `.tmp/period-final-screenshots/`，其中四张固定测试样例同步到本文末尾的 PR 界面材料；其他测试产物保留在被 Git 忽略的 `test-results/`，不提交用户私密数据。

真实 iPhone Safari/PWA 的键盘、动态文字和捏合缩放，以及打包后的 Windows 原生窗口手工验收，仍需在对应设备单独完成；模拟 WebKit 不能代表已完成真机验收。

## PR 29 的 CI 修复与字体审计

按 [Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography) 与 [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) 检查首页、洞察、设置和节律。目标是可读、连续的分组列表，不把 Web 页面宣称为获得 Apple 认证的原生界面。

- 字体栈优先 `-apple-system`、`BlinkMacSystemFont` 和 `system-ui`，中文保留 `PingFang SC` 与其他平台回退，不嵌入 Apple 字体。手机正文和任务名统一 17px/400，页面标题 28px/700，章节 17px/600，辅助文字采用 12–14px 的 rem 层级。移除中文标题的负字距和不必要的中间字重，数字采用等宽数字特性。
- 设置名称改为常规字重；洞察与节律的章节使用半粗体，避免正文与标题争夺注意。节律日期数字提高到正文大小，起止标注由 10px 提高到 12px；功能样式中的固定字号换为 rem，并允许按钮和历史行换行。
- 语义色跟随系统深色外观：背景、分组、分隔线、主次文字、交互色和经期范围分别适配。实心蓝按钮加深，以保证白色小字对比度；经期范围文本与起止圆点使用独立色值，避免深色外观反转后失去对比度。
- 洞察和设置章节由跳级的 h3 修正为 h2，保留原业务数据和统计口径。320px 日程元数据使用整行宽度，保持原有同排断言、44px 触控高度及长内容自然换行。
- CI 失败来自待安排标题与预计混在同一文本节点、320px 日程换行，以及旧 E2E 仍使用旧洞察文案和“时段自动生成预计”的规则。任务标题独立包裹后恢复精确识别；测试改为验证时段与预计独立并在刷新后保留，没有延长超时、跳过断言或回退新业务规则。
- 同步修复任务日历的日期按钮语义、星期/跨月日期小字对比度；深色外观下打印报告仍使用白底黑字。日程具体时间改为可通过键盘操作的按钮，空时段也保留 44px 触控宽度。
- Supabase 浏览器验收脚本支持 `THREADLINE_SUPABASE_WORKDIR`，方便对专用隔离实例重跑；仍只允许 loopback，不执行生产迁移。Lint 忽略生成的 `.tmp` 和测试报告。

新增 E2E 实际检查计算字体、200% 根字号、深浅色 axe 和页面横向溢出，保存正常/放大/深色截图。200% 根字号是浏览器布局回归，不等同于真机系统 Dynamic Type；跨平台系统字体也意味着 Windows 截图不能证明 iPhone 的实际 SF/PingFang 字形效果。最终执行结果以本 PR 验证节为准。

## PR 界面材料

以下为 390px 测试适配器的固定样例（2026-08-23），不包含真实账号或生理期数据。PNG 是自动化浏览器的原始全页截图，固定底栏停留在截图时的视口位置；不能用它代替真机验收。

- [首页紧凑列表](screenshots/task-estimates-periods/home-390.png)
- [洞察](screenshots/task-estimates-periods/insights-390.png)
- [设置](screenshots/task-estimates-periods/settings-390.png)
- [生理期记录](screenshots/task-estimates-periods/rhythm-390.png)

本轮复核：197 项单元测试通过；真实隔离 Supabase 浏览器登录/持久化与经期双客户端 Realtime 通过；320/390px 与模拟 iPhone WebKit 的针对性字体/经期/预计复跑 20 项通过。最终四页字体、打印颜色与任务流程复跑 12 项通过，日历零无障碍豁免复跑 1 项通过；Lint、Web 构建与主题/报告合同 4 项通过。完整远程 CI 结果以 PR Checks 为准。

深色外观材料（相同固定测试数据）：

- [首页深色](screenshots/task-estimates-periods/home-390-dark.png)
- [洞察深色](screenshots/task-estimates-periods/insights-390-dark.png)
- [设置深色](screenshots/task-estimates-periods/settings-390-dark.png)
- [生理期深色](screenshots/task-estimates-periods/rhythm-390-dark.png)
