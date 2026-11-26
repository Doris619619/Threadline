<!-- 文件用途：说明 Threadline 0.1.17 的工作站与经典输入焦点修复、验证结果和安装升级边界。 -->

# Threadline 0.1.17

- Windows 工作站恢复紧凑单行的“序号＋项目＋任务名”，不再在每项下面常显三个点，行高保持 28px。
- 长任务标题只占剩余空间并显示省略号，不再挤掉项目标签的括号；长项目名仍限制在 48px 内，完整名称保留在提示中。
- 工作站右键、Shift+F10、菜单键、Escape 归焦及拖动排序保留。移出或清空只改变引用，不删除任务；高度与自动贴合机制沿用旧版。
- 皮卡经典主题的文本框和下拉字段取消聚焦时的底部内阴影，智能导入原文、确认表格和 API 设置字段只保留均匀边框反馈。搜索框及无边框的两人目标字段使用轻背景；系统强制色仍保留 Highlight 轮廓。

## 范围

本次只调整共享前端样式、工作站行组件和验证用例。Web/PWA 与 Windows 静态前端共用焦点修复；工作站仍仅用于 Windows。没有数据库、云函数、账号、任务数据结构或计时账本迁移，沿用 0.1.16 的智能导入与个人 API 接入。

既有计时并发问题继续以 [交互已知问题](apple-interactions-known-issues.json) 记录，本版本不改变并发与计时规则。

## 验证

- `pnpm lint`、`pnpm typecheck`、改动文件格式和 `git diff --check` 通过。
- 全量单元/组件测试：132 个文件、872 项通过，包含工作站无常显按钮、右键和键盘移出引用的回归。
- `pnpm test:smart-import:ui`：20 项通过。覆盖经典浅/深色、鼠标和 Tab、智能导入原文及五列确认字段、真实 API 设置组件、强制色轮廓、两个触屏尺寸的命中区域与局部滚动；固定本地解析响应，不调用模型或写入用户任务。
- 工作站浏览器几何与交互复核覆盖 200/340px 宽度和四个主题：行高 28px，项目标签不随任务标题长度收缩，右键、键盘归焦及拖动排序通过。
- 匹配版本 tag 的 Release Actions 强制执行单元测试、Preview/正式目录包 parity、正式生产 NSIS 构建及三个资产上传后的重新下载比对。实际发布结果以 [Release Actions](https://github.com/Doris619619/Threadline/actions/workflows/release.yml) 和 [v0.1.17](https://github.com/Doris619619/Threadline/releases/tag/v0.1.17) 为准。

焦点修复的 [局部截图与来源](screenshots/classic-input-focus/README.md) 使用虚构文案。自动化、局部截图和产物校验不等同真实用户安装升级验收。

## 安装与更新

正式 Windows x64 安装包为 `Threadline_0.1.17_x64-setup.exe`，更新源同时提供同名 blockmap 和 `latest.yml`。安装版可在设置 → 关于 Threadline 检查更新、下载并确认重启；沿用现有应用 ID 和用户数据目录，普通退出不会自动安装。

真实用户的 0.1.16 → 0.1.17 检查、下载、确认重启及登录/数据保留仍待验收。实体多屏和真实 iPhone PWA 的日常使用不在本轮自动化结论内。
