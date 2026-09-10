<!-- 文件用途：说明皮卡经典本地 SVG、PNG、ICO 资源及复用的人物素材。 -->

# 皮卡经典素材

- `frame.svg`：96 × 96 原创像素金色窗框，四角卷纹、亮黄高光、橙金内边与棕色轮廓。CSS 使用九切片缩放，长边伸展时角花保持原比例。
- `bracket.svg`：12 × 48 原创金色像素括号，成对包围白底标题页签。
- `frame-dark.svg`、`bracket-dark.svg`：同一几何形状的低亮度哑金版本，深色模式避免亮黄色装饰盖过正文。
- `icon.svg`：32 × 32 原创金色任务窗图标，使用绿色勾选框与红色关闭装饰。
- `icon.png`、`electron/assets/icon-classic.ico`：通过 `node scripts/build-cottage-icon.mjs classic` 导出，PNG 为 512 × 512，ICO 包含 16、24、32、48、64、128、256px。

以上均为代码原生素材，无图像生成调用、远程资源或原游戏截图裁切。人物和家具复用 [皮卡小屋素材](../cottage/README.md)，两套主题共用设备装扮偏好。
