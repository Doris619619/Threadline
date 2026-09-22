<!-- 文件用途：逐项记录 Issue 49 的修复契约、测试证据、数据库发布次序与实机验收边界。 -->
# Issue 49 修复与验证记录

基线：`main a748abf`。本分支只交付修复、验证与 PR，不执行生产迁移、合并或发布。自动化结果不代表线上已修复。

| 问题 | 实现契约 | 回归位置 |
| --- | --- | --- |
| N01 分页 | 全表按唯一 ID 升序分页，每页最多 500，直到空页；失败不返回部分集合，恢复业务排序，转发取消信号 | `issue-49-pagination.test.ts`、`habit-repository.test.ts` |
| N02 批注隔离 | 环境及账号 v3 空间；仅确认任务归属后自动迁移，其余在设置中主动导入；保留 v1/v2，来源身份去重，原子保存笔迹及凭据 | `issue-49-annotations.test.tsx` |
| N03 Daily | 干净远端记录同时更新草稿和确认基准；脏草稿和串行 flush 保留 | `issue-49-inputs.test.tsx`、既有 Daily 测试 |
| N04 删除确认 | 删除 RPC 确认后清理笔迹；对账仅用确认集合，缺失 ID 按账号补查；失败保留原笔迹 | `issue-49-inputs.test.tsx`、`task-workflow.test.tsx`、`issue_49.test.sql` |
| N05 耗时 | 空值、有效数值与非法输入分开；有限非负整数，上限 2147483647；非法输入不提交且显示错误 | `issue-49-inputs.test.tsx`、`task-time.test.ts`、`task-create-and-edit.test.tsx` |
| N06 输入法 | 组合状态、isComposing、229 均阻止 Enter 快捷提交；普通 Enter 保留 | `issue-49-inputs.test.tsx`；Windows/iPhone 实机待验 |
| N07 工作站 | 原子加入、移除、清空可见 ID、移动到锚点；账号锁、失败读回、取消旧账号队列 | `issue-49-commands.test.tsx`、`cloud-interaction-feedback.test.tsx`、`issue_49.test.sql` |
| N08 PWA | Next 静态 chunk cache-first；固定 URL 图片字体 network-first，缓存存在时最多等 5 秒；拒绝 HTML 资产，只清理自有缓存 | `service-worker.test.ts`、`e2e/issue-49-worker.spec.ts` |
| N09 字段冲突 | 创建 insert；编辑只提交差异并比较原字段，检查日期/状态/删除及账本归属；恢复走独立命令，共享任务队列 | `issue-49-commands.test.tsx`、`cloud-task-updates.test.tsx`、`issue_49.test.sql` |
| N10 收尾日期 | 服务端账号时区为准，拒绝过去、原日期和过期时区；历史收尾默认今天，事务整体回滚 | `issue_49.test.sql`、既有 close-day 测试 |
| K01 后台失败 | 本会话首次就绪后不重新遮挡，保留缓存、显示非阻塞错误与重试 | `issue-49-startup.test.tsx` |
| K02 时区错误 | 显式账号时区阶段及重试；首次引导仍优先显示 | `issue-49-startup.test.tsx`、`threadline-startup-screen.test.tsx` |
| K03 窗口竞态 | 原生意图序号；异步结束检查是否仍有效，迟到回退只返回当前状态 | `scripts/test-electron-login-race.mjs`，纳入真实 Electron smoke |
| K04 初始化超时 | initialize_workspace 20 秒网络 deadline，覆盖响应体；退出与重试取消旧请求，人工阶段重试 | `cloud-recovery-deadline.test.ts` |

## 数据与兼容保护

先部署向前迁移 `202609220001_issue_49_data_safety.sql`，验证新 RPC 的权限和行为，再更新 Web/PWA/Electron 客户端。新客户端遇到缺失接口会明确报错，不退回整行写入。旧 RPC 保留兼容入口；旧客户端仍可能继续自身整行写入逻辑，应安排客户端升级。

不重写旧迁移，不回填或重算历史任务、Daily 快照、历史账本。任务更新仍通过原触发器。工作站清空只针对点击时可见 ID，保留其他设备新成员。排序锚点消失要求重试。

批注源 v1/v2 不删除；v3 以环境及账号分隔。导入无法确认归属的任务笔迹时，保留画布与内容并解除不可信任务绑定，避免立即被当前账号对账删除。导入凭据与笔迹一次性持久化，存储失败提示错误并保留源数据。多标签页支持 Web Locks 时串行合并差异。

分页不是数据库快照。任务未出现在集合中时必须完成账号限定的身份补查后再判定不存在；任何读取失败都保留关联笔迹。初始化超时不表示服务端未提交，只有已验证幂等的初始化允许用户重试；其他业务写入没有新增自动重试。

## 验证记录

- 原实现的 N03/N04/N05/N06 四项正确行为测试先失败；修复后通过。其余问题保留 Issue #49 的审计证据并补正式回归。
- 本地首轮完整测试：79 文件 / 388 用例通过；后续新增数据库、命令和跨端用例的最终结果待填。
- 本地 typecheck、Electron compile、SQL 静态契约通过；最终完整门禁以 PR 对应提交的 CI 为准。
- 本机 Docker Desktop 启动失败：Inference manager 无法访问 dockerInference socket。未重置 Docker 或删除用户环境；真实数据库验证交给 CI 的隔离本地 Supabase。
- 必须保持 CI 的 supabase、web、preview-demo、windows-electron 四项，不移除旧测试、不降低覆盖率、不加无条件重试。
- [ ] Windows 中文输入法实机候选确认、连续输入与失焦。
- [ ] 真 iPhone 中文输入、PWA 更新后在线/离线恢复。
- [ ] 生产迁移与客户端更新后的人工验收；本 PR 不执行此步骤。
