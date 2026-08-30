<!-- 文件用途：汇总 Threadline 批准参考图的视觉规格、能力边界和实现入口。 -->

# Threadline Visual Design Specification

## 事实来源

- reference.png：三张用户提供的 Calendar、Settings、Account disclosure 截图
- 提取日期：2026-08-30
- uiType：application-dashboard（0.95）
- 置信度摘要：高 10 / 中 8 / 低 1
- 需人工确认：3 项；需脚本验证：2 项

## 能力边界

- LLM 估算：颜色、阴影、字号和响应式间距。
- 脚本验证：对比度、屏幕尺寸和视觉回归。
- 不从截图实现无真实支持的日/周、新建日程、我的账户或快捷键。

## 布局与组件

参见 [visual-analysis.md](visual-analysis.md)、[layout-spec.md](layout-spec.md) 和 [component-tree.md](component-tree.md)。桌面采用克制的 sidebar + 主工作区；移动端保留项目既有底部导航。

## 设计 Token

参见 [tokens.json](tokens.json)。默认蓝色仅作为 `data-theme="blue"` 的主题 map；success、warning、danger 保持独立语义色。

## 实现风险

参见 [implementation-risks.md](implementation-risks.md) 与 [human-review-needed.md](human-review-needed.md)。
