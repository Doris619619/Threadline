import { z } from 'zod';

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '请输入任务名称')
    .max(200, '任务名称不能超过 200 个字符'),
  projectId: z.string().min(1, '请选择项目'),
  plannedMinutes: z.number().int().nonnegative().optional(),
  actualMinutes: z.number().int().nonnegative().optional(),
});
