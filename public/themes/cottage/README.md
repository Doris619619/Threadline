<!-- 文件用途：记录皮卡小屋本地美术、图标来源及可复查的生成提示词。 -->

# 皮卡小屋资源

第二版把完整房间从任务首页移除，仅保留为外观预览和登录插画。第三版保留原布局和配色，把简化 SVG 人物替换成按用户新穿搭图生成的细致像素角色，并新增七种个人家具。

`pixels.svg` 九种基础图形与 `furniture.svg` 七种个人家具均由原生 SVG 绘制，不是对游戏截图的裁切。后者包含黄心／绿星抱枕粉沙发、樱花秋千、抓娃娃机、星星电视柜、柠檬饮料、电脑桌和小熊；用户房间截图只用作外观参考。

`avatar-blue.webp`、`avatar-pink.webp`、`avatar-casual.webp`：内置 imagegen 以用户三套穿搭图为参考生成，最终采用 atlas `exec-7a125814-0d08-4b24-8ef2-642a593fbf9f`。每张 256 × 355、真实 RGBA、无损 WebP；三张合计约 218 KiB。运行时只依赖本目录文件。

人物生成提示词（内置工具，非 CLI）：

> Use case: stylized-concept. Create a production-ready pixel-art CHARACTER SPRITE ATLAS for a personal cozy productivity app. Reference image is the user's own Pikatang game outfits; faithfully reproduce the three illustrated doll characters with their distinctive face, hairstyle, outfit and proportions. Exactly three full-body characters arranged horizontally in three equal-width cells on a TRUE TRANSPARENT ALPHA background. Each figure same scale, centered within its cell, feet on the same baseline, generous transparent margins; no figures touch another cell. LEFT cell: the rightmost active character from reference: enormous flowing silver-lavender twin tails to calves, dark silver-rimmed sunglasses atop head, violet-blue eyes, pale blue mouth pacifier/accessory, hands clasped at chest, ice-blue sleeveless layered frilly short dress, blue ankle ribbons/shoes. CENTER cell: reference left character: lavender-pink long wavy hair, black baseball cap with pink square, pink oversized jacket, pastel lavender-blue top and shorts, pastel tall socks and sneakers, slightly crossed legs. RIGHT cell: reference middle character: pink-blonde curled long hair, sunglasses atop head, white rainbow-print T-shirt, denim shorts, pink shoulder bag, pastel sneakers. STYLE: faithfully imitate the fine detailed 2D pixel dolls in the reference, crisp stepped single-pixel dark plum outlines, clusters of lavender shading, delicate skin tones, vivid eyes, 1990s/2000s isometric social dress-up game sprite quality. Slender chibi dolls about 3 heads tall, NOT blocky voxel or Minecraft, NOT smooth vector. Composition landscape atlas with uniform transparent cells and equal-height figures, characters occupy ~85 percent canvas height. No oval mirrors, no gold frames, no furniture, no UI, no labels, no words, no ground shadows, no checkerboard drawn into image. Genuine alpha transparency is essential because these figures sit over both dark and cream backgrounds.

生成及后续透明编辑均返回 RGB 棋盘底；最终由 `scripts/export-cottage-avatars.mjs <atlas-path>` 做素材导出：去除中灰底色、分离三格、统一透明画布和基线、最近邻缩小、移除孤立底色杂点。深浅底实图检查保留衣服高光和深色轮廓，最终文件验证 alpha 范围 0–255。用户原图和中间生成图未进入仓库。

`personal-room.webp`：内置 imagegen 生成的个人家园插画，经 Sharp 转换 WebP（quality 92，保留原尺寸 1536 × 1024）。最终 PNG 原图生成标识为 `exec-b555abbd-5d73-4bd5-95ae-0fa536b92b8d`。运行时只依赖本目录 WebP。

参考输入由用户在任务中提供：第一张是其皮卡堂家园，第二张是其平时的三套穿搭，选择右侧冰蓝裙装。不是直接分发游戏截图。用户原图未复制进仓库，先前生成的森系房间也未用于最终产品。

最终主画面生成提示词：

> Reference image 1 is the user's actual personal house in original 4399 Picatown; image 2 shows personal outfits. Create one compact room faithfully matching the old pixel game: crisp pixel clusters, brown outlines, candy tiles, 2:1 isometric camera. Landscape 1536 × 1024, visible coarse pixel art. Take the top-left lounge: cream/pink rounded checker tiles, pastel pink/lavender/cyan walls with tiny stars and hearts, tall white-pink windows, pink bench with yellow heart and turquoise star cushions, flowering cherry blossom swing, hydrangea on a white table and pale teddy. Add the turquoise star rug, mint TV console, cream computer desk with pink stationery and pink claw machine. White kitten at front left. One small chibi character with long silver-lavender twin ponytails, dark square sunglasses on head, violet eyes, ice-blue short dress, blue shoes. Entire room visible; no text, HUD, logos or currency. Match the exact original browser game's sprite style, not realistic, painterly or cottagecore.

末次背景编辑提示词：

> Keep this exact pixel game room absolutely unchanged, including every furniture, player, floor and wall pixel and same canvas. Replace all gray checkerboard outside the room with completely uniform solid light pastel sky blue #EAF7FF. Opaque RGB output. No transparency, checkerboard, gradients, shadows or texture outside room. Only background replacement; all room interiors unchanged.

透明背景尝试返回了不带 alpha 的棋盘背景，最终选择实色背景版本；前端以房间外轮廓裁切显示，不依赖假透明。SVG 摆件、花朵、白猫按钮图标均为代码原生绘制，与图片分层，不通过颜色滤镜伪装家具替换。

`icon.svg`：本任务原创的粉屋顶、淡紫门框和白猫品牌图标。`icon.png` 和 `electron/assets/icon-cottage.ico` 由 `scripts/build-cottage-icon.mjs` 生成，支持 16–256px ICO 图层。Windows 安装器仍沿用当前构建默认蓝／粉选项，运行中的窗口可切换皮卡小屋图标。
