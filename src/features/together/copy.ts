/** @fileoverview 好友/情侣话术唯一来源；完整文案与共用提示在 docs/together-copy.md 中同步记录。 */
import type { Relationship, Room } from './types';
export const togetherCopy = {
  friends: {
    title: '我们的自习室',
    intro: '各自努力，互相见证。',
    empty: '第一个小目标，想请对方见证什么？',
    placeholder: '今天想完成什么？',
    cheer: '给你加油',
    cheered: 'TA 为你加油了。',
    submit: '提交成果',
    waiting: '等待 TA 验收',
    approve: '验收通过',
    approved: '这件事完成了，对方见证了你的努力。',
    changes: '请补充一下',
    surprise: '对方送来了一份额外奖励。',
    overdue: '已过截止时间，仍可提交成果。',
  },
  couple: {
    title: '同频',
    intro: '你的小目标，我都有认真看见。',
    empty: '想让 TA 第一个见证哪件小事？',
    placeholder: '今天想完成什么？悄悄告诉 TA。',
    cheer: '抱抱你，再加个油',
    cheered: 'TA 来给你抱抱啦：慢慢做，我陪你。',
    submit: '我做到啦，第一时间给你看。',
    waiting: '已经交给 TA 啦，等一句“真棒”。',
    approve: '我看见啦，真的很棒 ❤️',
    approved: '你做到啦。你的认真和努力，我都有好好看见。',
    changes: '还差一点点，再给我看看嘛。',
    surprise: 'TA 偷偷给你留了一份小奖励。',
    overdue: '晚一点没关系，我还在等你把它做好给我看。',
  },
} as const;
export const relationshipLabel: Record<Relationship, string> = {
  friends: '好朋友',
  couple: '情侣',
};
export const statusLabel = {
  active: '进行中',
  submitted: '待验收',
  changes: '待补充',
  completed: '已完成',
  cancelled: '已取消',
};
/** 空间昵称对双方可见；无昵称时回退空间展示名，不使用邮箱。 */
export function memberName(room: Room, user: string) {
  return user === room.user_a
    ? room.nickname_a || room.name_a
    : room.nickname_b || room.name_b;
}
/** 将 TA 替换为当前绑定对象的空间称呼。 */
export function address(text: string, name: string) {
  return text.replace(/TA\s*/g, name);
}
