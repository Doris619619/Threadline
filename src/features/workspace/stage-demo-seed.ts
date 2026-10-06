/** @fileoverview 为独立 Preview 创建虚构阶段和同源任务；正式账号与测试初始数据不读取。 */
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import type { StagePlan, Task } from '@/types/domain';

/** 按演示当天生成进行中、未来和过去的阶段，日期及 ID 与演示任务保持一致。 */
export function createDemoStagePlans(today = getLocalDateKey()): StagePlan[] {
  const stamp = today + 'T08:00:00.000Z';
  return [
    {
      id: 'demo-stage-holiday',
      name: '国庆假期',
      startDate: today,
      endDate: addLocalDateDays(today, 7),
      homeVisible: true,
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 'demo-stage-visit',
      name: '德国访学准备',
      startDate: addLocalDateDays(today, -2),
      endDate: addLocalDateDays(today, 10),
      homeVisible: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 'demo-stage-ielts',
      name: 'IELTS 冲刺',
      startDate: addLocalDateDays(today, 12),
      endDate: addLocalDateDays(today, 25),
      homeVisible: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 'demo-stage-term',
      name: '期末周',
      startDate: addLocalDateDays(today, -20),
      endDate: addLocalDateDays(today, -14),
      homeVisible: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 'demo-stage-time',
      name: '多项目时间验收',
      startDate: addLocalDateDays(today, -2),
      endDate: addLocalDateDays(today, 4),
      homeVisible: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
}

/** 示例清单使用原 Task 的三种状态，安排与完成操作继续编辑这些相同 ID。 */
export function createDemoStageTasks(today = getLocalDateKey()): Task[] {
  const titles = [
    '整理假期阅读清单',
    '完成课程报告初稿',
    '约朋友看展',
    '复习 IELTS 写作',
    '整理旅行照片',
    '学做一道新菜',
    '去公园散步',
    '阅读论文并记录想法',
    '练习听力',
    '准备访学材料',
    '整理书桌',
    '提交课程作业',
    '给家人打电话',
    '复盘九月',
    '列出新学期目标',
    '备份学习资料',
  ];
  return createDemoStagePlans(today).flatMap((plan, group) =>
    (group === 0
      ? titles
      : group === 1
        ? [
            '确认访学日程',
            '准备申请材料',
            '核对护照有效期',
            '联系接收导师',
            '整理研究计划',
            '预订行程',
          ]
        : group === 2
          ? ['完成听力练习', '复盘写作', '整理口语题库']
          : group === 3
            ? ['完成期末复习', '整理错题']
            : Array.from({ length: 22 }, (_, i) =>
                i === 0
                  ? '整理这段时间的课程资料与访学申请清单，记录需要继续跟进的事项和完整准备步骤'
                  : '验收任务 ' + (i + 1),
              )
    ).map((title, index): Task => {
      const completed =
        group === 3 || (group === 0 && index >= 10) || (group === 4 && index === 3);
      const scheduled = completed || (group === 0 && index >= 7);
      return {
        id: plan.id + '-task-' + index,
        stagePlanId: plan.id,
        projectId:
          group === 4
            ? ['work', 'course', 'research', 'life', 'other'][index % 5]
            : 'other',
        title,
        importance: 'normal',
        status: scheduled ? 'active' : 'waiting',
        completed,
        plannedDurationMinutes:
          group === 4
            ? index === 1
              ? undefined
              : index === 2
                ? 0
                : index === 4
                  ? 1
                  : index % 3 === 0
                    ? 150
                    : 30 + index * 5
            : undefined,
        actualDurationMinutes: group === 4 && completed ? 45 : undefined,
        date: scheduled ? addLocalDateDays(plan.startDate, index % 3) : undefined,
        schedulePendingTime: scheduled && !completed,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      };
    }),
  );
}
