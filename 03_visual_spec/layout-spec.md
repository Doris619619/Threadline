<!-- 文件用途：定义批准参考图对应的 Threadline 响应式应用布局规格。 -->

# Layout Specification

## 整体布局

- **UI Type**：application-dashboard
- **布局模式**：桌面为 sidebar + 主区 flex；移动端为底部导航 + 单列内容。
- **坐标系统**：响应式约束；截图 bbox 只作桌面比例证据。

## 区域规格

### App shell

| 属性     | 值                                  | Source               | Confidence |
| -------- | ----------------------------------- | -------------------- | ---------- |
| 定位方式 | desktop flex / mobile single column | screenshot-inferred  | 0.91       |
| 侧栏宽度 | 280–320px                           | screenshot-estimated | 0.86       |
| 主区内距 | 24–48px                             | screenshot-estimated | 0.78       |
| 背景     | canvas token                        | screenshot-estimated | 0.82       |

### Calendar

| 属性         | 值                    | Source               | Confidence |
| ------------ | --------------------- | -------------------- | ---------- |
| 定位方式     | grid                  | reference-visible    | 0.96       |
| 列数         | 7                     | reference-visible    | 1.00       |
| 日格最小高度 | 112px desktop         | screenshot-estimated | 0.70       |
| 圆角         | 16–20px outer surface | screenshot-estimated | 0.75       |

### Settings list

| 属性         | 值                    | Source               | Confidence |
| ------------ | --------------------- | -------------------- | ---------- |
| 定位方式     | vertical grouped list | reference-visible    | 0.96       |
| 单行最小高度 | 80–88px               | screenshot-estimated | 0.76       |
| 分组间距     | 24px                  | screenshot-estimated | 0.74       |
| 行分隔       | 1px subtle border     | reference-visible    | 0.90       |

### Account disclosure

| 属性 | 值 | Source | Confidence |
|---|---|---|
| 定位方式 | anchored popover above sidebar account trigger | reference-visible | 0.92 |
| 宽度 | 336px desktop；移动端不覆盖内容 | screenshot-estimated | 0.81 |
| 圆角 | 16px | screenshot-estimated | 0.82 |
| Z-index | above sidebar content | screenshot-inferred | 0.88 |
