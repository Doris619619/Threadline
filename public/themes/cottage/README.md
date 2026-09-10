<!-- 文件用途：记录皮卡小屋本地美术、图标来源及可复查的生成提示词。 -->

# 皮卡小屋资源

第二版把完整房间从任务首页移除，仅保留为外观预览和登录插画。全应用像素风由 `pixels.svg` 九种原创家具／饰物（小屋、挂历、书柜、望远镜、唱片机、梳妆镜、花盆、白猫、星星）、`cottage-sprite.tsx` 三套分层像素角色，以及 CSS 窗框、窗帘与控件状态构成；这些资源由代码原生绘制，不是对游戏截图的裁切。角色参考用户日常穿搭的发色、头饰与衣服轮廓。

`personal-room.webp`：内置 imagegen 生成的个人家园插画，经 Sharp 转换 WebP（quality 92，保留原尺寸 1536 × 1024）。最终 PNG 原图生成标识为 `exec-b555abbd-5d73-4bd5-95ae-0fa536b92b8d`。运行时只依赖本目录 WebP。

参考输入由用户在任务中提供：第一张是其皮卡堂家园，第二张是其平时的三套穿搭，选择右侧冰蓝裙装。不是直接分发游戏截图。用户原图未复制进仓库，先前生成的森系房间也未用于最终产品。

最终主画面生成提示词：

> Reference image 1 is the user's actual personal house in original 4399 Picatown; image 2 shows personal outfits. Create one compact room faithfully matching the old pixel game: crisp pixel clusters, brown outlines, candy tiles, 2:1 isometric camera. Landscape 1536 × 1024, visible coarse pixel art. Take the top-left lounge: cream/pink rounded checker tiles, pastel pink/lavender/cyan walls with tiny stars and hearts, tall white-pink windows, pink bench with yellow heart and turquoise star cushions, flowering cherry blossom swing, hydrangea on a white table and pale teddy. Add the turquoise star rug, mint TV console, cream computer desk with pink stationery and pink claw machine. White kitten at front left. One small chibi character with long silver-lavender twin ponytails, dark square sunglasses on head, violet eyes, ice-blue short dress, blue shoes. Entire room visible; no text, HUD, logos or currency. Match the exact original browser game's sprite style, not realistic, painterly or cottagecore.

末次背景编辑提示词：

> Keep this exact pixel game room absolutely unchanged, including every furniture, player, floor and wall pixel and same canvas. Replace all gray checkerboard outside the room with completely uniform solid light pastel sky blue #EAF7FF. Opaque RGB output. No transparency, checkerboard, gradients, shadows or texture outside room. Only background replacement; all room interiors unchanged.

透明背景尝试返回了不带 alpha 的棋盘背景，最终选择实色背景版本；前端以房间外轮廓裁切显示，不依赖假透明。SVG 摆件、花朵、白猫按钮图标均为代码原生绘制，与图片分层，不通过颜色滤镜伪装家具替换。

`icon.svg`：本任务原创的粉屋顶、淡紫门框和白猫品牌图标。`icon.png` 和 `electron/assets/icon-cottage.ico` 由 `scripts/build-cottage-icon.mjs` 生成，支持 16–256px ICO 图层。Windows 安装器仍沿用当前构建默认蓝／粉选项，运行中的窗口可切换皮卡小屋图标。
