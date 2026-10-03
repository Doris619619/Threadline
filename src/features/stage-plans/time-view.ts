/** @fileoverview 时间图和合并任务清单共享当前口径、选择状态与确认保存入口。 */
import type { StageTimeMetric } from './time-breakdown';
import type { SaveStageEstimate } from './task-estimate-editor';

export type StageTimeView = {
  metric: StageTimeMetric;
  selected?: string;
  active?: string;
  saving: boolean;
  select: (id: string) => void;
  hover: (id: string | undefined) => void;
  saveEstimate: SaveStageEstimate;
  saveActual: SaveStageEstimate;
};
