<!-- 文件用途：完整记录两人空间好友版、情侣版及共用提示，供产品审阅；由代码生成并通过 --check 校验。 -->

# 两人空间文案表

情侣专属文案采用用户 2026-09-28 提供的版本。TA 会在页面中替换为空间昵称或展示名，不按性别推测称呼。好友版与情侣版共用微信成果验收流程。

## 关系专属话术

| 场景         | 好朋友                             | 情侣                                       |
| ------------ | ---------------------------------- | ------------------------------------------ |
| 空间名称     | 我们的自习室                       | 同频                                       |
| 页头说明     | 各自努力，互相见证。               | 你的小目标，我都有认真看见。               |
| 空间空状态   | 第一个小目标，想请对方见证什么？   | 想让 TA 第一个见证哪件小事？               |
| 创建目标提示 | 今天想完成什么？                   | 今天想完成什么？悄悄告诉 TA。              |
| 鼓励按钮     | 给你加油                           | 抱抱你，再加个油                           |
| 收到鼓励     | TA 为你加油了。                    | TA 来给你抱抱啦：慢慢做，我陪你。          |
| 成果入口     | 提交成果                           | 我做到啦，第一时间给你看。                 |
| 等待验收     | 等待 TA 验收                       | 已经交给 TA 啦，等一句“真棒”。             |
| 通过按钮     | 验收通过                           | 我看见啦，真的很棒 ❤️                      |
| 通过后的提示 | 这件事完成了，对方见证了你的努力。 | 你做到啦。你的认真和努力，我都有好好看见。 |
| 补充提示     | 请补充一下                         | 还差一点点，再给我看看嘛。                 |
| 收到惊喜     | 对方送来了一份额外奖励。           | TA 偷偷给你留了一份小奖励。                |
| 逾期         | 已过截止时间，仍可提交成果。       | 晚一点没关系，我还在等你把它做好给我看。   |

## 微信成果与时区约定

- 图片通过微信发送，应用不上传、读取或验证微信内容；“已通过微信发送成果”是执行人的主动声明。
- 点击确认后进入待验收，由对方明确通过后完成；应用不把微信发送等同于已完成。
- 每个人看到自己的账号时区。顶部显示当前日期、时钟及地区，详情显示查看时区与创建时区。
- 自己的奖励是自由文本；额外惊喜保留文字记录，照片仍走微信。
- 甜蜜互动只发生在 flag 上，不复制 Parallel 的独立抱抱/想你功能。

## 共用文案、按钮、状态与错误提示

以下包括页面里的固定文案片段与动态模板；模板中的变量在运行时替换为姓名、时间或计数。完整句子的来源可按文件定位。

| 文案 / 模板                                                                  | 来源                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| · 已见证                                                                     | flag-card.tsx                                               |
| （选填）                                                                     | flag-editor.tsx                                             |
| ${memberName(room, room.user_a)}与${memberName(room, room.user_b)}           | panel.tsx                                                   |
| ${partner}发来了关系变更。                                                   | panel.tsx                                                   |
| 按时提交                                                                     | flag-detail.tsx                                             |
| 保存称呼                                                                     | binding.tsx、settings.tsx                                   |
| 保存修改                                                                     | flag-editor.tsx                                             |
| 保留现在的关系                                                               | settings.tsx、supabase/migrations/202609280001_together.sql |
| 抱抱你，再加个油                                                             | copy.ts                                                     |
| 编辑 flag                                                                    | flag-editor.tsx                                             |
| 编辑约定                                                                     | flag-detail.tsx                                             |
| 补充说明                                                                     | flag-editor.tsx                                             |
| 不能接受自己发出的邀请。                                                     | repository.ts                                               |
| 查看                                                                         | flag-card.tsx、panel.tsx                                    |
| 查看邀请                                                                     | binding.tsx                                                 |
| 拆惊喜                                                                       | flag-card.tsx、memory-timeline.tsx                          |
| 撤销邀请                                                                     | binding.tsx                                                 |
| 称呼更新了                                                                   | panel.tsx                                                   |
| 称呼需为 1–30 字，不能使用邮箱。                                             | repository.ts                                               |
| 成果说明（选填）                                                             | flag-detail.tsx                                             |
| 成果提交后，目标与约定不能修改。                                             | repository.ts                                               |
| 待补充                                                                       | copy.ts                                                     |
| 待验收                                                                       | copy.ts                                                     |
| 当前离线，输入已保留，请联网后重试。                                         | state.tsx                                                   |
| 等 TA 立下一个小目标。                                                       | flag-board.tsx                                              |
| 等待 TA 验收                                                                 | copy.ts                                                     |
| 等你验收                                                                     | flag-card.tsx                                               |
| 第一个小目标，想请对方见证什么？                                             | copy.ts                                                     |
| 对方的 flag                                                                  | flag-board.tsx                                              |
| 对方的邀请码                                                                 | binding.tsx                                                 |
| 对方送来了一份额外奖励。                                                     | copy.ts                                                     |
| 对方想绑定为${relationshipLabel[room.proposed_relationship!]}                | settings.tsx                                                |
| 对方在为你加油                                                               | flag-card.tsx                                               |
| 复制失败，请手动选择邀请码复制。                                             | binding.tsx                                                 |
| 复制邀请码                                                                   | binding.tsx                                                 |
| 各自努力，互相见证。                                                         | copy.ts                                                     |
| 给对方的昵称                                                                 | settings.tsx                                                |
| 给对方的小惊喜                                                               | flag-detail.tsx                                             |
| 给你加油                                                                     | copy.ts                                                     |
| 更新了空间里的称呼                                                           | supabase/migrations/202609280001_together.sql               |
| 功能暂未就绪，请等待两人空间服务部署完成。                                   | repository.ts                                               |
| 关闭                                                                         | dialog.tsx                                                  |
| 关系变更已发出，等待对方确认。                                               | panel.tsx                                                   |
| 关系类型                                                                     | settings.tsx                                                |
| 关系已结束                                                                   | supabase/migrations/202609280001_together.sql               |
| 关系已结束，记录仅原成员可见                                                 | supabase/migrations/202609280001_together.sql               |
| 还差一点点，再给我看看嘛。                                                   | copy.ts                                                     |
| 还没有结束的约定。                                                           | flag-board.tsx                                              |
| 还没有以前的空间。                                                           | settings.tsx                                                |
| 好感度                                                                       | panel.tsx                                                   |
| 好感度 +                                                                     | flag-detail.tsx                                             |
| 好感度 +1                                                                    | flag-card.tsx、flag-detail.tsx                              |
| 好朋友                                                                       | binding.tsx、copy.ts、settings.tsx                          |
| 互动暂未读取。                                                               | flag-board.tsx                                              |
| 恢复我的展示名                                                               | settings.tsx                                                |
| 回到现在的空间                                                               | panel.tsx                                                   |
| 加油已送到                                                                   | flag-card.tsx                                               |
| 奖励自己一杯奶茶                                                             | flag-editor.tsx                                             |
| 接受邀请                                                                     | binding.tsx                                                 |
| 结束                                                                         | settings.tsx                                                |
| 结束后保留记录，不计为完成，也不扣好感度。                                   | flag-detail.tsx                                             |
| 结束了这条 flag                                                              | flag-detail.tsx                                             |
| 结束这条 flag                                                                | flag-detail.tsx                                             |
| 截止                                                                         | flag-card.tsx、flag-detail.tsx                              |
| 截止后提交                                                                   | flag-detail.tsx                                             |
| 截止时间                                                                     | flag-editor.tsx                                             |
| 解除绑定                                                                     | settings.tsx                                                |
| 解除并结束未完成的 flag                                                      | settings.tsx                                                |
| 今天想完成什么？                                                             | copy.ts                                                     |
| 今天想完成什么？悄悄告诉 TA。                                                | copy.ts                                                     |
| 进行中                                                                       | copy.ts                                                     |
| 看看成果                                                                     | flag-card.tsx                                               |
| 空间内容                                                                     | panel.tsx                                                   |
| 空间设置                                                                     | panel.tsx、settings.tsx                                     |
| 空间展示名，不使用邮箱                                                       | binding.tsx                                                 |
| 立个 flag                                                                    | flag-editor.tsx、panel.tsx                                  |
| 立个小目标，请对方见证。                                                     | flag-board.tsx                                              |
| 立下 flag                                                                    | flag-detail.tsx、flag-editor.tsx                            |
| 例如：完成默写，正确率达到 90%                                               | flag-editor.tsx                                             |
| 两人空间                                                                     | panel.tsx                                                   |
| 留一句夸奖（选填）                                                           | flag-detail.tsx                                             |
| 每次鼓励、见证与惊喜，都会留下一个小心意                                     | panel.tsx                                                   |
| 目标                                                                         | flag-editor.tsx                                             |
| 内容刚刚发生变化，输入已保留。请关闭后重新打开，核对最新内容再提交。         | repository.ts                                               |
| 你                                                                           | flag-card.tsx                                               |
| 你的小目标，我都有认真看见。                                                 | copy.ts                                                     |
| 你或对方已经绑定，请刷新查看。                                               | repository.ts                                               |
| 你没有执行此操作的权限。                                                     | repository.ts                                               |
| 你在这里叫「                                                                 | binding.tsx                                                 |
| 你做到啦。你的认真和努力，我都有好好看见。                                   | copy.ts                                                     |
| 年                                                                           | memory-timeline.tsx                                         |
| 情侣                                                                         | binding.tsx、copy.ts、settings.tsx                          |
| 请补充一下                                                                   | copy.ts、flag-detail.tsx                                    |
| 请对方确认关系                                                               | settings.tsx                                                |
| 请检查输入。                                                                 | flag-editor.tsx                                             |
| 请求内容已经变化，请重新打开后操作。                                         | repository.ts                                               |
| 请确认已经看过微信里的成果，并符合这条 flag 的约定。                         | flag-detail.tsx                                             |
| 请使用已有账号登录后开启两人空间。                                           | state.tsx                                                   |
| 请使用已有账号登录后开启两人空间。当前演示不连接真实账号。                   | panel.tsx                                                   |
| 请填写需要补充的内容或惊喜说明。                                             | repository.ts                                               |
| 请先填写空间展示名。                                                         | repository.ts                                               |
| 请先通过微信发送成果，再确认提交。                                           | repository.ts                                               |
| 请先在微信把成果发给对方，再回来提交。对方验收通过后才算完成。               | flag-detail.tsx                                             |
| 请选择好朋友或情侣，并请对方确认。                                           | repository.ts                                               |
| 取消                                                                         | binding.tsx                                                 |
| 缺少两人空间运行时                                                           | state.tsx                                                   |
| 确认发送，交给对方验收                                                       | flag-detail.tsx                                             |
| 确认关系                                                                     | settings.tsx                                                |
| 确认结束                                                                     | flag-detail.tsx                                             |
| 确认了新的关系                                                               | supabase/migrations/202609280001_together.sql               |
| 日                                                                           | memory-timeline.tsx                                         |
| 上次提交结果尚未确认，请先按原内容重试，或关闭后核对最新记录。               | use-command.ts                                              |
| 生成邀请码                                                                   | binding.tsx                                                 |
| 实时连接暂不可用，回到页面会重新读取。                                       | state.tsx                                                   |
| 首次提交：                                                                   | flag-detail.tsx                                             |
| 输入邀请码                                                                   | binding.tsx                                                 |
| 送个小惊喜                                                                   | flag-detail.tsx                                             |
| 送给对方                                                                     | flag-detail.tsx                                             |
| 送来鼓励                                                                     | flag-detail.tsx                                             |
| 送来小惊喜                                                                   | flag-detail.tsx                                             |
| 提交成果                                                                     | copy.ts、flag-card.tsx                                      |
| 同频                                                                         | copy.ts                                                     |
| 完成的目标会留在这里。                                                       | flag-board.tsx                                              |
| 完成后的奖励                                                                 | flag-detail.tsx、flag-editor.tsx                            |
| 晚一点没关系，我还在等你把它做好给我看。                                     | copy.ts                                                     |
| 我                                                                           | flag-card.tsx                                               |
| 我的 flag                                                                    | flag-board.tsx                                              |
| 我看见啦，真的很棒 ❤️                                                        | copy.ts                                                     |
| 我们的关系                                                                   | binding.tsx                                                 |
| 我们的回忆                                                                   | panel.tsx                                                   |
| 我们的自习室                                                                 | copy.ts                                                     |
| 我做到啦，第一时间给你看。                                                   | copy.ts                                                     |
| 无法读取邀请，请重试。                                                       | binding.tsx                                                 |
| 先告诉对方怎么称呼你                                                         | binding.tsx                                                 |
| 想让 TA 第一个见证哪件小事？                                                 | copy.ts                                                     |
| 修改了目标或约定                                                             | supabase/migrations/202609280001_together.sql               |
| 修改了约定                                                                   | flag-detail.tsx                                             |
| 需要补充什么                                                                 | flag-detail.tsx                                             |
| 验收通过                                                                     | copy.ts、flag-detail.tsx                                    |
| 邀请                                                                         | binding.tsx                                                 |
| 邀请码已复制，通过微信发给对方吧。                                           | binding.tsx                                                 |
| 邀请码已过期、已使用或已撤销，请向对方索取新的邀请码。                       | repository.ts                                               |
| 邀请你绑定为                                                                 | binding.tsx                                                 |
| 邀请一个人                                                                   | binding.tsx                                                 |
| 一次只绑定一个人。目标各自完成，成果通过微信分享，在这里给彼此一个认真回应。 | binding.tsx                                                 |
| 已保存                                                                       | flag-detail.tsx                                             |
| 已发出关系变更，等待对方确认。                                               | settings.tsx                                                |
| 已过截止时间，仍可提交成果。                                                 | copy.ts                                                     |
| 已见证                                                                       | memory-timeline.tsx                                         |
| 已结束的约定                                                                 | panel.tsx                                                   |
| 已经交给 TA 啦，等一句“真棒”。                                               | copy.ts                                                     |
| 已取消                                                                       | copy.ts                                                     |
| 已通过微信发送成果                                                           | flag-detail.tsx                                             |
| 已完成                                                                       | copy.ts                                                     |
| 已为 TA 加油                                                                 | flag-card.tsx                                               |
| 以前的空间                                                                   | settings.tsx                                                |
| 有效至                                                                       | binding.tsx                                                 |
| 与                                                                           | settings.tsx                                                |
| 月                                                                           | memory-timeline.tsx                                         |
| 再看一些                                                                     | flag-board.tsx                                              |
| 在这里留一句奖励说明；照片或其他礼物通过微信发送。                           | flag-detail.tsx                                             |
| 暂时无法完成操作，请重试。                                                   | use-command.ts                                              |
| 暂时无法完成操作，输入已保留，请检查网络后重试。                             | repository.ts                                               |
| 怎样算完成                                                                   | flag-detail.tsx、flag-editor.tsx                            |
| 找一个人，见证彼此的小目标。                                                 | binding.tsx、panel.tsx                                      |
| 这段关系已结束，记录只读。                                                   | repository.ts                                               |
| 这个时间无效，或在夏令时切换时出现两次；请换一个明确的时间。                 | time.ts                                                     |
| 这件事的过程                                                                 | flag-detail.tsx                                             |
| 这件事完成了，对方见证了你的努力。                                           | copy.ts                                                     |
| 这项操作已经完成，请刷新查看。                                               | repository.ts                                               |
| 这一步需要对方来完成。                                                       | repository.ts                                               |
| 正在保存…                                                                    | binding.tsx、dialog.tsx                                     |
| 正在查看…                                                                    | binding.tsx                                                 |
| 正在打开两人空间…                                                            | panel.tsx                                                   |
| 正在读取…                                                                    | flag-board.tsx                                              |
| 正在读取记录…                                                                | flag-detail.tsx                                             |
| 正在读取空间资料…                                                            | binding.tsx                                                 |
| 正在读取目标                                                                 | flag-board.tsx                                              |
| 正在读取时间…                                                                | clock.tsx                                                   |
| 正在进行                                                                     | panel.tsx                                                   |
| 执行人取消                                                                   | supabase/migrations/202609280001_together.sql               |
| 只读                                                                         | panel.tsx                                                   |
| 只有你们两个人用的称呼                                                       | settings.tsx                                                |
| 重试                                                                         | flag-board.tsx                                              |
| 重新读取                                                                     | flag-board.tsx、flag-detail.tsx、panel.tsx                  |
| 状态已经变化，请刷新查看。                                                   | repository.ts                                               |
| 自己的展示名                                                                 | settings.tsx                                                |
| TA 来给你抱抱啦：慢慢做，我陪你。                                            | copy.ts                                                     |
| TA 偷偷给你留了一份小奖励。                                                  | copy.ts                                                     |
| TA 为你加油了。                                                              | copy.ts                                                     |

## 维护

先修改 src/features/together 中的文案，再运行 `node scripts/generate-together-copy.mjs`。提交前运行 `node scripts/generate-together-copy.mjs --check`，避免文档与页面不一致。
