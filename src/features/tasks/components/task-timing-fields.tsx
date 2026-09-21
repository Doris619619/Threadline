/** @fileoverview 任务编辑的受控时间与估时字段；修改完整时间范围后自动回填，可再次手动调整。 */
'use client';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { estimateFromTimeRange } from '@/features/tasks/task-time';
import { PlannedMinutesField } from './planned-minutes-field';
import type { Task } from '@/types/domain';

/** 随对话框挂载恢复草稿，标题等无关编辑不重新计算历史的手动预计。 */
export function TaskTimingFields({
  editing,
  project,
}: {
  editing?: Task;
  project: ReactNode;
}) {
  const [start, setStart] = useState(editing?.plannedStartTime ?? '');
  const [end, setEnd] = useState(editing?.plannedEndTime ?? '');
  const [planned, setPlanned] = useState(
    editing?.plannedDurationMinutes?.toString() ?? '',
  );
  /** 使用同一次输入的最新范围更新预计，保留半输入状态及原实际时长。 */
  const changeTime = (field: 'start' | 'end', value: string) => {
    if (field === 'start') setStart(value);
    else setEnd(value);
    setPlanned((previous) =>
      estimateFromTimeRange(
        field === 'start' ? value : start,
        field === 'end' ? value : end,
        previous,
      ),
    );
  };
  return (
    <>
      <div className="task-form-grid">
        {project}
        <label>
          开始时间
          <Input
            name="start"
            value={start}
            onChange={(event) => changeTime('start', event.target.value)}
            placeholder="1420 或 14:20"
          />
        </label>
        <label>
          结束时间
          <Input
            name="end"
            value={end}
            onChange={(event) => changeTime('end', event.target.value)}
            placeholder="可选"
          />
        </label>
      </div>
      <div className="task-form-grid task-form-durations">
        <PlannedMinutesField value={planned} onChange={setPlanned} />
        <label>
          实际时长（分钟）
          <Input
            name="actual"
            type="number"
            defaultValue={editing?.actualDurationMinutes}
          />
        </label>
      </div>
    </>
  );
}
