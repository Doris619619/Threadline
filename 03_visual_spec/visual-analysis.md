<!-- 文件用途：记录三张批准 Threadline 参考图可见的布局、色彩、文字与间距证据。 -->

# Visual Analysis

## 1. 全局构图

- **UI Type**: application-dashboard
- **UI Type Confidence**: 0.95
- **页面尺寸**：1672 × 940（设置图）；日历图为 1672 × 940、1448 × 1087
- **主视觉模型**：structured-layout

### UI Type Rationale

- 三张图都可见固定左侧导航、主工作区和有边界的内容表面。
- 日历、设置和账户浮层是独立的应用控制，不是 raster 场景的一部分。

### Visible Element Inventory

| 元素            | bbox                    | 视觉证据                    | Source            | Confidence |
| --------------- | ----------------------- | --------------------------- | ----------------- | ---------- |
| 左侧栏          | x:0,y:0,w:300,h:940     | 品牌、七项导航、底部账户卡  | reference-visible | 0.96       |
| 日历主区        | x:340,y:85,w:1250,h:824 | 月标题、工具栏、七列网格    | reference-visible | 0.94       |
| 设置主区        | x:375,y:0,w:1297,h:940  | 页面标题和分组列表          | reference-visible | 0.95       |
| 账户 disclosure | x:206,y:498,w:337,h:438 | Doris、邮箱、设置与退出登录 | reference-visible | 0.94       |

### Rejected Assumptions

| 假设组件/结构      | 拒绝原因                         | 影响           |
| ------------------ | -------------------------------- | -------------- |
| 日/周视图          | 截图虽有切换器，仓库没有真实能力 | 不生成切换组件 |
| 新建日程           | 截图有按钮，仓库没有日历创建流程 | 不生成按钮     |
| 账户编辑与快捷键页 | 无可见的真实仓库能力             | 不生成入口     |

### Asset Strategy

| 资产/视觉层      | 实现方式   | 原因                         | Source                  | Confidence |
| ---------------- | ---------- | ---------------------------- | ----------------------- | ---------- |
| 图标             | Lucide SVG | 截图是线性图标；仓库已安装   | inferred-implementation | 0.92       |
| 表面、网格、浮层 | HTML/CSS   | 可见为规则化布局，无照片资产 | reference-visible       | 0.96       |

## 2. 颜色系统

| Token 名     | Hex     | 角色                | 出现位置                   | Source               | Confidence |
| ------------ | ------- | ------------------- | -------------------------- | -------------------- | ---------- |
| accent       | #007AFF | 系统蓝主操作/当前态 | 侧栏选中、主按钮、日期圆点 | screenshot-estimated | 0.78       |
| accent-soft  | #EAF3FF | 低强调选中底色      | 侧栏、事件块               | screenshot-estimated | 0.74       |
| surface      | #FFFFFF | 主表面              | 月历、列表与浮层           | screenshot-estimated | 0.88       |
| canvas       | #F7F8FA | 窗口背景            | 全局背景                   | screenshot-estimated | 0.82       |
| text-primary | #171B24 | 标题与正文          | 标题、导航、日期           | screenshot-estimated | 0.84       |

### 估算对比度

| 前景         | 背景    | 估算比值 | 备注                       |
| ------------ | ------- | -------- | -------------------------- |
| text-primary | surface | 约 15:1  | estimated-contrast         |
| accent       | surface | 约 4.1:1 | 小号文字需在实现后脚本复核 |

## 3. 字体排印

| 语义角色      | 字体族     | 字号    | 字重 | 行高 | 颜色 Token     | Source               | Confidence |
| ------------- | ---------- | ------- | ---- | ---- | -------------- | -------------------- | ---------- |
| 页面标题      | 系统无衬线 | 30–34px | 700  | 1.2  | text-primary   | screenshot-estimated | 0.75       |
| 月标题        | 系统无衬线 | 28px    | 700  | 1.2  | text-primary   | screenshot-estimated | 0.78       |
| 导航/列表标题 | 系统无衬线 | 16–18px | 600  | 1.35 | text-primary   | screenshot-estimated | 0.80       |
| 辅助说明      | 系统无衬线 | 14–16px | 400  | 1.45 | text-secondary | screenshot-estimated | 0.74       |

## 4. 间距系统

- **基础单位**：4px（screenshot-inferred，0.78，recommended）
- **内边距模式**：侧栏 24–32px；主区 40–48px；列表行约 24px。
- **网格/坐标系统**：日历为 7 列、完整周；设置为纵向分组列表。

| 间距 Token | 值   | 用途       | Source               | Confidence |
| ---------- | ---- | ---------- | -------------------- | ---------- |
| space-2    | 8px  | 图标与标签 | screenshot-estimated | 0.78       |
| space-4    | 16px | 行内间距   | screenshot-estimated | 0.80       |
| space-6    | 24px | 卡片内距   | screenshot-estimated | 0.76       |
| space-10   | 40px | 页面区块   | screenshot-estimated | 0.70       |
