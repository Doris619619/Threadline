<!-- 文件用途：记录智能批量导入的六字段交互、解析服务边界、服务端配置与本地验证方式。 -->

# AI 智能批量导入任务

首页「今日日程」的「智能导入」打开同一弹窗内的两步流程：粘贴 Markdown、纯文本或口语计划，点击「开始解析」；检查识别出的任务并点击「确认导入」。AI 清理废话、重复和背景，按行动意图提取任务，不按换行拆分。没有可执行任务时保留原文，供补充后重新解析。

确认界面直接展示六项可编辑参数：开始时间、结束时间、项目、任务名称、预计时长、实际耗时。项目和名称必填，其余未知值留空；没有日期、优先级、阶段、完成状态或折叠的额外参数。长名称自动换行，每条可取消勾选或删除。桌面与手机、现有主题和深浅模式共用语义颜色。

只匹配当前账号的活跃项目，不创建项目。无法确定的任务归入现有 `isFallback` 项目（“其他”）。任务内部日期取打开弹窗时首页选中的日期；默认未完成，其他系统字段沿用日程创建规则。明确起止时间可通过现有规则计算预计分钟，仍能手动改写或清空；只有结束时间时保留识别值，确认时提示补充有效开始时间，不推断钟点。跨午夜或无效时间沿用现有校验。

## 架构与保存边界

- `src/features/tasks/smart-import/`：入口、六字段编辑、解析客户端与保存队列。通过现有 Supabase browser client 调用函数，Web/PWA/Electron 均不依赖 Next 服务端路由。
- `supabase/functions/smart-task-import/`：仅接收 `{ text }`，验证当前用户 JWT，使用用户作用域客户端和 RLS 查询项目，再向 DeepSeek 发起 JSON 模式解析。返回 `{ tasks }`，每条只有 `title / projectId / startTime / endTime / plannedMinutes / actualMinutes`；未知选填字段为 `null`。不保存输入、解析结果或任务；服务角色只读取当前账号的加密凭据，不用于查询项目或写任务。
- `supabase/functions/ai-api-settings/` 与 `_shared/`：设置端点按已认证 owner 管理 DeepSeek 凭据，只返回 `configured / serverConfigured / canSave` 三个布尔值。账号密钥 AES-GCM 加密后存入独立的 `account_ai_credentials` 表，随机 IV 与账号绑定的 AAD 防止跨账号交换密文；客户端角色没有表访问权限，也不接入 Realtime。设置仅提供 DeepSeek Key 保存/替换/移除，不扩展其他供应商、模型或自定义 API 地址。
- `src/features/tasks/task-create.ts`：单条创建和导入共用名称、项目、时间及分钟校验。保留 `normalizeTime`、`parseEstimateMinutes`、`parseDurationInput` 和 `estimateFromTimeRange` 的现有语义。
- 用户确认后逐条调用 `useWorkspaceData().createTask`。实际耗时直接随 Task 保存，由现有数据库 trigger 入账，不另行累计。

解析阶段使用没有百分比的不确定进度条；最多 20,000 字、100 条任务，超量或畸形响应明确报错，不截取部分任务冒充完整结果。Edge 请求总时限 65 秒，前端 95 秒兜底；取消解析会中止客户端请求及可传播的上游请求。API 错误不向客户端转发密钥或上游响应正文。

保存阶段显示真实已结束请求数与总数。同步提交锁阻止重复点击；只有服务器确认后才计为成功。部分失败显示成功/失败数，成功项不重发。首次发送时冻结任务内容和 UUID，失败项重试沿用同一快照；已发送字段锁定，避免网络结果不明时更改同一写入。创建请求异常后按 UUID 和 owner 补查：已存在则确认并更新缓存，不使用 upsert、不覆盖任务；创建历史使用稳定事件 ID，以冲突忽略方式幂等补齐，不覆写已有快照；无法确认时保留失败。关闭弹窗后未确认任务不自动保存。

## 服务端配置（本次开发不执行部署）

需要由有权限的维护者在目标 Supabase 项目配置并部署函数。没有函数或密钥时，解析显示配置/服务错误，现有手动创建不受影响。演示与显式本地适配器没有云登录，入口会说明需登录云工作区。设置页保存只确认密钥已存储，不声称 API 已验证连通；解析时才调用 DeepSeek。输入只存在当前表单内存和保存请求，保存成功后清空，不写本地存储、查询缓存或安装包，不回显已保存密钥或片段。

1. 经授权后，在目标数据库应用 `supabase/migrations/202611190001_account_ai_credentials.sql`，只新增独立密文表及访问限制，不改变任务 schema。
2. 在 Edge secrets 中配置 `AI_CREDENTIALS_ENCRYPTION_KEY`，使用密码学安全随机生成的 **32 字节标准 base64** 主密钥。此值是服务端加密密钥，必须安全备份；现有密文依赖它解密，不可随意替换或删除。账号密钥优先，无账号密钥时可选使用服务端 `DEEPSEEK_API_KEY` 兜底。
3. 可选设置 `DEEPSEEK_MODEL`；默认 `deepseek-flash`，关闭 thinking 并使用 `response_format: { type: 'json_object' }`。
4. 保持 `smart-task-import` 和 `ai-api-settings` 的 `verify_jwt = true`，函数内部另用 `auth.getUser` 验证身份。函数使用平台内置 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`（兼容 `SUPABASE_ANON_KEY`）及仅用于私密凭据存储的 `SUPABASE_SERVICE_ROLE_KEY`，这些服务端值不得进入客户端。
5. 经授权后才部署两个 Edge Function。普通前端只需原有 Supabase URL 与 publishable key，CSP 沿用 Supabase 连接目标。不要把 DeepSeek Key、加密主密钥或 service-role 放入 `NEXT_PUBLIC_*`、Web 公开配置、Electron Main/Preload/安装包或仓库。

本地 Edge 调试可将 secrets 放在仓库外的 env 文件，运行 `pnpm exec supabase functions serve smart-task-import --env-file <本地文件>`，用本地 Supabase 登录用户 JWT 请求函数。不要使用生产账号执行自动化写入测试。

## 验证

`pnpm test` 覆盖模型输出与 HTTP/认证边界、六字段确认、真实进度、部分失败和固定 UUID 重试，以及个人 Key 设置、加密隔离与密文表权限。`pnpm typecheck`、`pnpm lint`、Web/PWA 构建与 Electron renderer 静态导出验证共享代码边界。真实 DeepSeek 语义提取质量、已部署函数、真实 Supabase 保存及 iPhone 真机体验需要配置服务后单独验收；mock 测试不代表这些外部环节已通过。

接口参考：[DeepSeek JSON 模式](https://api-docs.deepseek.com/guides/json_mode/)、[DeepSeek thinking 模式](https://api-docs.deepseek.com/guides/thinking_mode/)、[Supabase 函数认证请求头](https://supabase.com/docs/guides/functions/auth-headers)。

### 2026-11-19 本地验证记录

- `pnpm test --maxWorkers=4`：118 个文件、731 项通过。
- TypeScript、ESLint、变更文件 Prettier、`pnpm test:sql:static` 与两个 Edge 入口的 Deno 类型检查通过。PGlite 实际执行新增凭据表迁移，验证客户端无读写权限、服务端角色可访问及 RLS 已开启。
- Web/PWA production 构建（含 precache、nonce CSP、构建边界检查）与 Electron renderer 静态导出通过。显式使用本地测试适配器，无生产账号调用。
- `e2e/smart-import.spec.ts` 在桌面和手机共 6 项通过。本机未安装项目指定的 Chrome channel，临时测试配置改用已安装的 Microsoft Edge Chromium，未改变仓库浏览器配置。
- 使用真实 React 组件和构建 CSS、本地 HTTP mock，检查 6 组导入视口/主题、3 组 API 设置视口/主题、axe、长标题缩窄、手机输入字号、逐条进度、部分失败固定 ID 重试和密钥保存清空。此项不代表真实模型或数据库联调。
- Electron Main/Preload 编译、真实静态协议下的导入与 API 设置入口检查、计时站回归通过。完整 `pnpm test:electron` 在既有双屏入口窗口居中断言失败（第二显示器 x 位置偏差），本次未改该原生窗口代码；不能据此称完整套件通过。
- 未运行生产迁移、未部署函数、未使用真实 DeepSeek 密钥；真实 API 解析质量、云端保存和 iPhone 真机验收待服务配置后进行。
