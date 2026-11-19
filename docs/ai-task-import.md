<!-- 文件用途：记录智能导入的五列确认、Windows/Web 个人 Key 使用方式、服务端配置与生产验收边界。 -->

# AI 智能批量导入任务

首页「今日日程」的「智能导入」打开同一弹窗内的两步流程：粘贴 Markdown、纯文本或口语计划，点击「开始解析」；检查识别出的任务并点击「确认导入」。AI 清理废话、重复和背景，按行动意图提取任务，不按换行拆分。没有可执行任务时保留原文，供补充后重新解析。

确认界面按用户最新选定的 A「轻边框表格」展示五项参数，顺序为：项目、任务名称、预计时长、开始时间、结束时间。每条任务为一个表格行，统一表头，各字段直接编辑；项目和名称必填，未知选填值留空。保留全选、逐条取消勾选和删除，没有日期、实际耗时、优先级、阶段、完成状态或折叠的额外参数。长名称在任务单元格内自然换行并撑高当前行，完整显示。手机沿用同一表格，在局部横向滑动访问后面的字段，按钮保持可见，不把整页撑宽。标题、输入框与行距保持紧凑，按钮上方不加分隔横线；现有主题与深浅模式共用语义颜色。

最终界面截图：[桌面](screenshots/ai-task-import/desktop.png)、[深色](screenshots/ai-task-import/desktop-dark.png)、[手机](screenshots/ai-task-import/mobile.png)。三张原始 PNG 已从集成后的真实 Next 页面刷新，未裁剪或加工：桌面浅色与深色均为 1440×1000，手机浅色为 390×844，均使用蓝色主题与固定的三条合成任务。日期固定为 2026-11-19；解析由浏览器测试拦截提供，不调用模型、账号或数据库，也未确认保存任务。手机保留表格局部横向滚动。[截图来源记录](screenshots/ai-task-import/capture-manifest.json) 包含运行时、精确视口、主题、字体及源版本；截图用于核对布局，不代表生产环境联调。

输入弹窗按参考图使用左侧图标、加粗标题和标题下的一句说明，正文只保留输入框与取消/开始解析按钮；不显示长示例、底部辅助小字或按钮区分隔横线。弹窗局部使用已内置的思源黑体，保持清晰的无衬线文字与原有主题颜色，不改变其他页面字体。

导入与 API 设置字段沿用统一交互系统：输入焦点使用边框和内部底线，普通模式没有外围轮廓或发光环；强制色模式保留系统焦点标识。760px 及以下和 coarse pointer 设备的关闭、勾选、删除、编辑、确认目标至少为 44×44 CSS px；触屏字号至少 16px，表格按需要局部横向滚动。荧光笔再次点击可退出绘制，五色菜单继续使用共享顶层定位、互斥选择、方向键、Escape 和关闭归焦。

只匹配当前账号的活跃项目，不创建项目。无法确定的任务归入现有 `isFallback` 项目（“其他”）。任务内部日期取打开弹窗时首页选中的日期；默认未完成，其他系统字段沿用日程创建规则。明确起止时间可通过现有规则计算预计分钟，仍能手动改写或清空；只有结束时间时保留识别值，确认时提示补充有效开始时间，不推断钟点。跨午夜或无效时间沿用现有校验。

## 在 Windows 或 Web/PWA 设置个人 Key

0.1.16 Windows 安装版可以直接填写个人 DeepSeek API Key，无需先在网站设置。Windows 与 Web/PWA 共用同一个 Cloud 账号的加密凭据；在任一端保存后，另一端登录同一账号即可使用。公开演示和本地适配器不提供账号 Key 设置。

1. 在 Windows 应用或 Web/PWA 登录 Cloud 账号，进入设置 → AI / API 接入。
2. 填写个人 DeepSeek API Key 并保存；替换或移除也在同一处完成。界面只返回是否配置，不回显已保存密钥。
3. 返回今日日程 → 智能导入，粘贴文本并开始解析。保存成功只确认凭据已存储，API 有效性和模型连通性要由实际解析确认。

浏览器联调是可选验收方式，不是 Windows 填写 Key 的前置步骤。当前云端凭据管理已完成生产验收，但有效个人 Key 的模型调用与真实任务导入尚未完成，见下方快照。

## 架构与保存边界

- `src/features/tasks/smart-import/`：入口、五列编辑、解析客户端与保存队列。正式 Web/PWA/Electron 通过现有 Supabase browser client 调用函数，不依赖 Next 服务端路由。
- `supabase/functions/smart-task-import/`：仅接收 `{ text }`，验证当前用户 JWT，使用用户作用域客户端和 RLS 查询项目，再向 DeepSeek 发起 JSON 模式解析。返回 `{ tasks }`，每条只有 `title / projectId / startTime / endTime / plannedMinutes / actualMinutes`；未知选填字段为 `null`。不保存输入、解析结果或任务；服务角色只读取当前账号的加密凭据，不用于查询项目或写任务。
- `supabase/functions/ai-api-settings/` 与 `_shared/`：设置端点按已认证 owner 管理 DeepSeek 凭据，只返回 `configured / serverConfigured / canSave` 三个布尔值。账号密钥 AES-GCM 加密后存入独立的 `account_ai_credentials` 表，随机 IV 与账号绑定的 AAD 防止跨账号交换密文；客户端角色没有表访问权限，也不接入 Realtime。设置仅提供 DeepSeek Key 保存/替换/移除，不扩展其他供应商、模型或自定义 API 地址。
- `src/features/tasks/task-create.ts`：单条创建和导入共用名称、项目、时间及分钟校验。保留 `normalizeTime`、`parseEstimateMinutes`、`parseDurationInput` 和 `estimateFromTimeRange` 的现有语义。
- 用户确认后逐条调用 `useWorkspaceData().createTask`。解析响应保留原六字段合同以兼容已部署函数，但最新五列确认不接收其中的 `actualMinutes`，实际耗时草稿保持空白，避免静默保存未展示、未经确认的数据；不改变普通创建和实际耗时记账逻辑。

解析阶段使用没有百分比的不确定进度条；最多 20,000 字、100 条任务，超量或畸形响应明确报错，不截取部分任务冒充完整结果。Edge 请求总时限 65 秒，前端 95 秒兜底；取消解析会中止客户端请求及可传播的上游请求。API 错误不向客户端转发密钥或上游响应正文。

保存阶段显示真实已结束请求数与总数。同步提交锁阻止重复点击；只有服务器确认后才计为成功。部分失败显示成功/失败数，成功项不重发。首次发送时冻结任务内容和 UUID，失败项重试沿用同一快照；已发送字段锁定，避免网络结果不明时更改同一写入。创建请求异常后按 UUID 和 owner 补查：已存在则确认并更新缓存，不使用 upsert、不覆盖任务；创建历史使用稳定事件 ID，以冲突忽略方式幂等补齐，不覆写已有快照；无法确认时保留失败。关闭弹窗后未确认任务不自动保存。

## 服务端配置

生产项目已完成下方快照中的配置和部署；以下步骤用于新环境配置或维护。没有函数或可用 Key 时，解析显示配置/服务错误，现有手动创建不受影响。公开演示与 production 本地适配器没有云登录，入口会说明需登录云工作区；localhost 显式开发适配器可按下节临时联调。设置页保存只确认密钥已存储，不声称 API 已验证连通；解析时才调用 DeepSeek。输入只存在当前表单内存和保存请求，保存成功后清空，不写本地存储、查询缓存或安装包，不回显已保存密钥或片段。

1. 在新环境的目标数据库应用 `supabase/migrations/202611190001_account_ai_credentials.sql`，只新增独立密文表及访问限制，不改变任务 schema。
2. 在 Edge secrets 中配置 `AI_CREDENTIALS_ENCRYPTION_KEY`，使用密码学安全随机生成的 **32 字节标准 base64** 主密钥。此值是服务端加密密钥，必须安全备份；现有密文依赖它解密，不可随意替换或删除。账号密钥优先，无账号密钥时可选使用服务端 `DEEPSEEK_API_KEY` 兜底。
3. 可选设置 `DEEPSEEK_MODEL`；默认 `deepseek-flash`，关闭 thinking 并使用 `response_format: { type: 'json_object' }`。
4. 保持 `smart-task-import` 和 `ai-api-settings` 的 `verify_jwt = true`，函数内部另用 `auth.getUser` 验证身份。函数使用平台内置 `SUPABASE_URL`，公开 key 优先读取 `SUPABASE_PUBLISHABLE_KEYS` JSON 字典的 `default`，再回退单数 `SUPABASE_PUBLISHABLE_KEY`、legacy `SUPABASE_ANON_KEY`；凭据管理 key 优先读取 `SUPABASE_SECRET_KEYS.default`，再回退 `SUPABASE_SECRET_KEY`、legacy `SUPABASE_SERVICE_ROLE_KEY`。字典缺失、畸形或无有效 `default` 时只尝试这些明确的回退，不任取其他具名 key；publishable 与 secret 分开选择，不能互作回退。管理 key 仅用于私密凭据存储，这些服务端值不得进入客户端。
5. 迁移和密钥配置完成后部署两个 Edge Function。普通前端只需原有 Supabase URL 与 publishable key，CSP 沿用 Supabase 连接目标。不要把 DeepSeek Key、加密主密钥或 service-role 放入 `NEXT_PUBLIC_*`、Web 公开配置、Electron Main/Preload/安装包或仓库。

本地 Edge 调试可将 secrets 放在仓库外的 env 文件，运行 `pnpm exec supabase functions serve smart-task-import --env-file <本地文件>`，用本地 Supabase 登录用户 JWT 请求函数。不要使用生产账号执行自动化写入测试。

## 2026-11-19 生产服务验收快照

生产项目 `yhhxsqozbildrnfhtgps` 已应用凭据表迁移，完整迁移 dry-run 返回 `upToDate` 与空清单。`account_ai_credentials` 的 RLS 为 true，anon/authenticated 没有直接表权限，service_role 具有 CRUD 权限，未加入 Realtime。32 字节加密主密钥已配置，并已在本机以 Windows DPAPI 保护备份。

`ai-api-settings` 与 `smart-task-import` 均为 ACTIVE v1，`verify_jwt=true`。云运行时 key 兼容修复提交为 `58b397e`；相关 79 项测试包含 30 项新增回归，两个 Edge 入口的 Deno 类型检查、全局 lint 与 TypeScript 通过；发布前全量单测 132 个文件 / 872 项通过。

生产 SDK 使用两个临时验收账号完成 25 项检查：保存、重读、删除、跨账号隔离、客户端直读拒绝、空解析请求返回 400、无 Key 返回 503。账号已全部清理；此次生产验收为 0 次模型调用、0 次既有账号任务写入。有效个人 Key 的模型解析和真实导入仍未验收。Windows 正式 NSIS 的本地构建和 packaged EXE smoke 已通过；客户端公开状态以 [0.1.16 发布记录](release-0.1.16.md) 及其 Release 链接为准。

另外直接运行 production 配置的 0.1.16 Windows packaged 程序，以独立资料目录和一个临时账号完成真实登录、首次主题/性别引导、设置内保存合成 Key、重开仍已保存且输入为空、移除及再重开未设置，共 14 项检查通过。没有通过网站预配置或 RPC 预置引导；没有调用模型，账号、程序和临时目录已清理。此测试使用 unpacked EXE，未覆盖 NSIS 安装或已安装版自启动步骤。[Windows 实测截图](screenshots/ai-task-import/windows-key-saved.png) 及[来源记录](screenshots/ai-task-import/windows-key-manifest.json) 保留原始证据。

## localhost 临时解析预览

不部署 Edge Function 也能在本机弹窗试用真实解析，仅用于 `NODE_ENV=development`、`NEXT_PUBLIC_THREADLINE_TEST_ADAPTER=true` 的 localhost/loopback Web 页面。生产构建、公开演示、Electron 与普通云会话继续使用原来的 Edge Function，不启用这条本地链路。

1. 用显式本地开发适配器启动 `pnpm dev --hostname 127.0.0.1 --port 3000`。
2. 编译临时服务：`pnpm exec esbuild scripts/local-ai-preview.ts --bundle --platform=node --format=esm --outfile=.tmp/local-ai-preview.mjs`。
3. 启动 `.tmp/local-ai-preview.mjs`，通过进程标准输入提供一行 `{ "apiKey": "临时密钥" }` JSON。启动器应直接写入子进程 stdin，不把密钥放在命令行参数、源码、文件、环境变量或浏览器中。

服务仅监听 `127.0.0.1:8871`，密钥只保留于进程内存，停止服务后需重新提供。浏览器 POST 同源 `/api/local-smart-import`，Next 开发路由固定转发至本机服务；两端拒绝外站 Origin 和不合法输入，不允许客户端指定上游 URL。项目只采用当前本地工作区的活跃项目，复用正式解析处理器、提示词和六字段校验，不自动创建项目。

临时服务仅解析；弹窗确认导入沿用当前本地适配器，保存到本地演示工作区，不访问 Supabase 数据库。Key 不会写入账号设置或自动带到其他设备。未启动临时服务时会提示服务不可用；此链路不能替代云端函数部署和真实账号验收。

## 验证

`pnpm test` 覆盖模型输出与 HTTP/认证边界、五列确认、真实进度、部分失败和固定 UUID 重试，以及个人 Key 设置、加密隔离与密文表权限。`pnpm typecheck`、`pnpm lint`、Web/PWA 构建与 Electron renderer 静态导出验证共享代码边界。开发阶段 localhost 已用一段真实计划验证 DeepSeek 解析与弹窗联通；本次生产凭据与认证边界验收见上方快照。有效个人 Key 的生产模型调用、真实任务导入、更多语义提取质量及 iPhone 真机体验仍需单独验收。

`pnpm test:smart-import:ui` 在独占回环端口启动显式本地开发适配器并在结束后关闭该服务；可用 `THREADLINE_SMART_IMPORT_PORT` 覆盖默认 32221。矩阵包含桌面焦点、760px 和 1024px coarse pointer，共 8 项浏览器回归。导入通过真实 Next 页面与固定解析响应进入确认，个人 Key 表单由真实 `AiApiSettings` 组件和应用 CSS 构成的浏览器夹具验证，仅将账号上下文和配置状态替换为内存数据；这些夹具不改变生产或演示门禁，也不调用模型、真实账号或数据库。CI 的 Web 作业执行此命令。本机浏览器版本缺失时可显式设置 `THREADLINE_SMART_IMPORT_BROWSER_CHANNEL=msedge`，默认仍使用 CI 安装的 Chromium。

接口参考：[DeepSeek JSON 模式](https://api-docs.deepseek.com/guides/json_mode/)、[DeepSeek thinking 模式](https://api-docs.deepseek.com/guides/thinking_mode/)、[Supabase 函数认证请求头](https://supabase.com/docs/guides/functions/auth-headers)。

### 2026-11-19 开发阶段验证记录

以下保留生产部署前的开发过程；当前生产状态以上方服务验收快照为准。

- 合并交互系统时，先用未改 CSS 的真实页面复现：导入字段和 API 设置输入存在外围焦点线，原文输入有外部光晕；760px 与 1024px coarse pointer 的关闭仅 28×28、删除 28×32、确认按钮高 40px。修复后同一矩阵 8 项通过；荧光笔/共享菜单、导入队列、API 设置和全 CSS 交互合同共 5 个测试文件、41 项通过。既有桌面批注开关与拖动锁定、选色绘制与刷新偏好两项业务 E2E 通过。此记录只覆盖本次集成，不能替代云端或真机验收。

- `pnpm test --maxWorkers=4`：118 个文件、731 项通过。
- TypeScript、ESLint、变更文件 Prettier、`pnpm test:sql:static` 与两个 Edge 入口的 Deno 类型检查通过。PGlite 实际执行新增凭据表迁移，验证客户端无读写权限、服务端角色可访问及 RLS 已开启。
- Web/PWA production 构建（含 precache、nonce CSP、构建边界检查）与 Electron renderer 静态导出通过。显式使用本地测试适配器，无生产账号调用。
- `e2e/smart-import.spec.ts` 在桌面和手机共 6 项通过。本机未安装项目指定的 Chrome channel，临时测试配置改用已安装的 Microsoft Edge Chromium，未改变仓库浏览器配置。
- 使用真实 React 组件和构建 CSS、本地 HTTP mock，检查 6 组导入视口/主题、3 组 API 设置视口/主题、axe、长标题缩窄、手机输入字号、逐条进度、部分失败固定 ID 重试和密钥保存清空。此项不代表真实模型或数据库联调。
- 首轮 Electron Main/Preload 编译、真实静态协议下的导入与 API 设置入口检查、计时站回归通过；当时完整 `pnpm test:electron` 在双屏入口居中断言失败。后续已修复原生居中并通过原严格检查，相关证据见 [交互整改记录](apple-interactions-known-issues.json)。
- 首轮功能验证发生在生产部署之前；生产迁移、函数和凭据管理现已完成上方快照所列验收，有效个人 Key 的生产模型调用、真实导入及 iPhone 真机仍待验收。
- 后续 localhost 临时联调：解析客户端、六字段交互、本机服务与开发代理共 77 项测试通过；类型检查、变更文件 ESLint 和 Prettier 通过。Host/Origin、生产/Electron 禁用、输入边界和异常脱敏均有覆盖。
- 真实 localhost 弹窗通过内存代理调用 DeepSeek：课程、报销、大纲和简历的混合计划识别为 9 条任务，预计时长合计 310 分钟，简历去重，六字段可编辑；浏览器请求不含密钥，解析前后本地任务存储一致，未点击确认导入。此验证没有生产数据库写入或部署。
- A 方案五列表格调整：79 项相关测试、桌面/手机共 6 项 E2E、类型检查和变更文件 ESLint/Prettier 通过。真实 Next 页面配合固定解析响应验证 7 组视口/主题（含 320px 手机、深色、Classic 和 Cottage）、axe、长名称展开、表格横向滚动及操作按钮可见；自动化没有调用收费模型或写入任务。
