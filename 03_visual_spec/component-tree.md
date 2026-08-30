<!-- 文件用途：把批准设计中可见元素映射为 Threadline 的组件层级与视觉职责。 -->

# Component Tree

## UI Type

- **值**：application-dashboard
- **组件树模型**：dashboard-shell

## 树形结构

ThreadlineDocument [source: inferred-implementation]
└── AppShell [source: inferred-implementation]
├── Sidebar [source: reference-visible]
│ ├── Brand [source: reference-visible]
│ ├── PrimaryNavigation [source: reference-visible]
│ └── AccountDisclosure [source: screenshot-inferred]
└── MainContent [source: inferred-implementation]
├── CalendarPanel [source: reference-visible]
└── SettingsPanel [source: reference-visible]

## 组件详情

### Sidebar

- **Source**: reference-visible
- **bbox**: x:0,y:0,w:300,h:940
- **尺寸**: desktop 280–320px；移动端不显示
- **背景**: surface token
- **内容类型**: 品牌、导航、账户 trigger
- **Confidence**: 0.96

### CalendarPanel

- **Source**: reference-visible
- **bbox**: x:340,y:85,w:1250,h:824
- **背景**: surface token
- **边框**: subtle border token
- **圆角**: radius-lg token
- **内容类型**: 真实月份工具栏和七列热力网格
- **Confidence**: 0.94

### SettingsPanel

- **Source**: reference-visible
- **bbox**: x:375,y:0,w:1297,h:940
- **背景**: canvas token + grouped list surfaces
- **内容类型**: 真实设置入口和只读账户摘要
- **Confidence**: 0.95

### AccountDisclosure

- **Source**: screenshot-inferred
- **bbox**: x:206,y:498,w:337,h:438（参考图）
- **背景**: surface token
- **圆角**: radius-lg token
- **内容类型**: 真实 identity、设置、退出登录
- **Confidence**: 0.88
