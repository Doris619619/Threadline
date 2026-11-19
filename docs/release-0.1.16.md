<!-- 文件用途：记录 0.1.16 的计时、日程统计、统一交互、智能导入与原生居中改动，以及发布前实际验收快照。 -->

# Threadline 0.1.16

- 包含已经合并的 #61、#62、#63、#64、#65。
- 完成计时时先保存本机待提交记录并及时收起卡片，云端保存失败时恢复卡片供幂等重试；跨午夜/DST 统计视图修正自然日边界，保留原始记录。
- 首页剩余与当日预计只统计所选日期的日程任务，排除 Daily 预计；空日程显示零预计。Daily 的预计保留在清单中，今日实际投入继续包含已记录的 Daily 分钟。
- 全项目按钮、菜单与主题采用统一交互状态。普通焦点使用背景和内部底线，强制色模式保留系统标识；首页右栏提供互斥选择菜单，任务更多入口可直接发现，危险操作独立分组。手机与触屏扩大真实命中区域，输入字号保持可读。
- 今日日程支持从杂乱文本智能提取任务、去重和匹配已有项目。确认表格按项目、任务、预计时长、开始时间和结束时间排列，可逐项编辑后导入；显示真实保存进度，部分失败沿用原任务编号与内容安全重试，成功项不重复提交。
- 设置新增个人 DeepSeek API Key 保存、替换和移除。Windows 安装版和 Web/PWA 可直接在设置 → AI / API 接入填写 Key，共用同一 Cloud 账号，无需先在网站设置。密钥按账号加密保存在服务端，不回显到客户端；保存只确认已存储，模型连通性由实际解析确认。
- Windows 完整工作台首次居中修正半 DIP 坐标取整偏差，保留原内容尺寸、位置记忆和一 DIP 验收阈值。原生窗口在 Renderer 完成权威状态同步后再显示，避免恢复时短暂显示过期界面。

## 2026-11-19 发布前验收快照

生产项目 `yhhxsqozbildrnfhtgps` 已应用 `202610210001_timer_midnight_dst.sql` 与 `202611190001_account_ai_credentials.sql`，迁移 dry-run 返回 `upToDate` 和空清单。AI 凭据表 RLS 开启，anon/authenticated 无直接表权限，service_role 具有 CRUD 权限，凭据表未加入 Realtime。32 字节加密主密钥已配置，并在本机以 Windows DPAPI 保护备份；供应商密钥、加密主密钥与 service-role 不进入前端或安装包。

`ai-api-settings` 与 `smart-task-import` 均为 ACTIVE v1，`verify_jwt=true`。生产 SDK 使用两个临时账号完成 25 项检查，包括凭据保存、重读、删除、跨账号隔离、客户端直读拒绝、空解析请求返回 400 与缺 Key 返回 503；验收账号已全部清理。此次验收未调用模型，未写入既有账号任务，不等同有效个人 Key 的模型解析或真实导入验收。

正式生产配置的 NSIS 已在本地构建，manifest 记录 clean commit `4dfd7a1`，生成 `release/Threadline_0.1.16_x64-setup.exe`、同名 blockmap 与 `release/latest.yml`。真实 packaged EXE smoke 已通过 CSP、受限 protocol、Preload 与窗口检查；未据此标记安装、卸载或升级成功。

同一 production Windows 程序另完成 14 项真实 UI 检查：临时账号实际登录和首次引导后，直接在应用设置保存合成 Key，确认输入清空、重开状态持久化，再移除并重开确认未设置。未用网站预配置或 RPC 预置，未调用模型；账号、进程和独立资料目录全部清理。此项证明 Windows 应用可直接配置 Key，不等同 NSIS 安装或真实有效 Key 的模型调用。[原始截图及来源](ai-task-import.md#2026-11-19-生产服务验收快照)。

仍未完成的发布与使用验收：

- [ ] 使用有效个人 Key 调用模型并确认真实任务导入。
- [ ] Web/PWA 0.1.16 生产发布及线上版本核验。
- [ ] 真实用户 NSIS 安装/卸载与 0.1.15 → 0.1.16 数据保留验收。
- [ ] 推送 `v0.1.16` tag、Release workflow 与三个公开资产及线上更新源核验。
- [ ] 已安装 0.1.15 经检查、下载、确认重启升级到 0.1.16 的完整验收。

## 验证与已知问题

发布前云兼容修复为 `58b397e`，版本提交为 `4dfd7a1`。最新全量单测 132 个文件 / 872 项通过；兼容相关 79 项测试包含 30 项新增回归，两个 Edge 入口的 Deno 类型检查、全局 lint 与 TypeScript 通过。Web 与 Electron Renderer 构建已有通过记录；完整 HIG 收集 112 项，其中 110 项通过、两项原有触屏专用用例在桌面条件下跳过。智能导入独立浏览器回归 8 项、Together E2E 11 项通过。原生居中保持原严格检查，已有两块连接显示器与完整开发壳原生回归通过记录。

计时并发回归已有失败，按用户要求暂缓处理。本版本未修复这些并发问题，不将相关 CI 失败描述为已解决，也不据局部测试通过声称完整业务 CI 全绿。保留的问题与证据见 [交互整改已知问题](apple-interactions-known-issues.json)。

正式 tag 必须匹配 `package.json` 的 `0.1.16`。Release workflow 先执行测试和静态 parity，再构建 NSIS、上传草稿并重新下载核对安装器、blockmap 与 `latest.yml`；核对通过后脚本会自动公开并设为 latest，没有额外人工等待点。本快照尚未推送 tag 或公开 Release，公开状态以 [Release Actions](https://github.com/Doris619619/Threadline/actions/workflows/release.yml) 和 [v0.1.16 稳定 tag 页](https://github.com/Doris619619/Threadline/releases/tag/v0.1.16) 为准。本地构建与 packaged smoke 不代表签名、真实用户安装升级或线上更新已验收。

## 材料

- [统计范围](stage-plans.md)、[统一交互与验收](apple-interactions.md)、[智能导入与服务配置](ai-task-import.md)。
- [Windows 构建](WINDOWS_BUILD.md)、[自动更新与真实升级验收](desktop-auto-update.md)。
- 自动化与截图不能替代实体设备的安装升级、自启动、多屏拔插和 iPhone PWA 验收。
