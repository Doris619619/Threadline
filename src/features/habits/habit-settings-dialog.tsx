/** @fileoverview 账号时区和独立睡觉分界表单；草稿失败保留，规则生效日期明确可见。 */
'use client';
import { TimezoneSelect } from '@/features/settings/timezone-select';
import { useState } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { useHabits } from './habit-state';
import {
  habitAddDays,
  habitBusinessDate,
  formatHabitMinutes,
  validateHabitRules,
  validateHabitTimezone,
} from './habit-time';
import { habitRuleForDate } from './habit-statistics';
import type { RuleValues } from './habit-types';

/** 以原生分钟输入和当天/次日选择表达连续时间轴，编辑一档不改动其他档。 */
function BoundaryInput({
  label,
  value,
  onChange,
  sleep = true,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  sleep?: boolean;
}) {
  return (
    <label className="habit-boundary">
      <span>{label}</span>
      <div>
        {sleep && (
          <select
            aria-label={`${label}日期`}
            value={value >= 1440 ? 'next' : 'same'}
            onChange={(event) =>
              onChange((value % 1440) + (event.target.value === 'next' ? 1440 : 0))
            }
          >
            <option value="same">当天</option>
            <option value="next">次日</option>
          </select>
        )}
        <input
          aria-label={label}
          type="time"
          required
          value={formatHabitMinutes(value, false)}
          onChange={(event) => {
            if (!event.target.value) return;
            const [hour, minute] = event.target.value.split(':').map(Number);
            onChange(hour * 60 + minute + (value >= 1440 ? 1440 : 0));
          }}
        />
      </div>
    </label>
  );
}
/** 保存配置使用稳定请求标识；重新读取冲突后允许显式保留草稿并再次保存。 */
export function HabitSettingsDialog({ onClose }: { onClose: () => void }) {
  const { data, now, configure, busy, retry } = useHabits();
  const effective = habitAddDays(
    habitBusinessDate(now, data.settings.timezone, 'sleep'),
    1,
  );
  const [timezone, setTimezone] = useState(data.settings.timezone);
  const [rules, setRules] = useState<RuleValues>(() =>
    habitRuleForDate(data.rules, effective),
  );
  const [version, setVersion] = useState(data.settings.version);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  /** 修改草稿就是新意图；网络失败不修改 ID，重试可以幂等返回。 */
  const update = (patch: Partial<RuleValues>) => {
    setRules((old) => ({ ...old, ...patch }));
    setRequestId(crypto.randomUUID());
  };
  /** 完成前后均由服务端确认；校验失败不关闭窗口。 */
  const submit = async () => {
    try {
      validateHabitTimezone(timezone);
      validateHabitRules(rules);
      await configure(timezone, rules, version, requestId);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '设置保存失败');
    }
  };
  return (
    <ManagementDialog title="习惯设置" onClose={onClose} busy={busy} error={error}>
      <div className="habit-settings-form">
        <TimezoneSelect
          autoFocus
          value={timezone}
          onChange={(zone) => {
            setTimezone(zone);
            setRequestId(crypto.randomUUID());
          }}
        />
        <p className="habit-caption">
          全 App 使用此时区，不跟随电脑。已有记录保持原时间。
        </p>
        <BoundaryInput
          label="起床目标"
          value={rules.wake_target}
          sleep={false}
          onChange={(wake_target) => update({ wake_target })}
        />
        <h3>睡觉分档</h3>
        <BoundaryInput
          label="达标上限"
          value={rules.sleep_target}
          onChange={(sleep_target) => update({ sleep_target })}
        />
        <BoundaryInput
          label="较晚起点"
          value={rules.sleep_late}
          onChange={(sleep_late) => update({ sleep_late })}
        />
        <BoundaryInput
          label="较晚上限"
          value={rules.sleep_very_late}
          onChange={(sleep_very_late) => update({ sleep_very_late })}
        />
        <ul className="habit-rule-preview">
          <li>达标：≤ {formatHabitMinutes(rules.sleep_target)}</li>
          <li>
            稍晚：&gt; {formatHabitMinutes(rules.sleep_target)}，&lt;{' '}
            {formatHabitMinutes(rules.sleep_late)}
          </li>
          <li>
            较晚：{formatHabitMinutes(rules.sleep_late)} 至{' '}
            {formatHabitMinutes(rules.sleep_very_late)}（含边界）
          </li>
          <li>很晚：&gt; {formatHabitMinutes(rules.sleep_very_late)}</li>
        </ul>
        <p className="habit-caption">
          新分档从 {effective} 起生效，历史记录保持原规则。睡觉和每日状态在 04:00 分日。
        </p>
        {error && (
          <button
            type="button"
            onClick={() => {
              retry();
              setError('已请求读取最新设置。读取完成后可采用最新版本继续保存草稿。');
            }}
          >
            重新读取
          </button>
        )}
        {version !== data.settings.version && (
          <button
            type="button"
            onClick={() => {
              setVersion(data.settings.version);
              setRequestId(crypto.randomUUID());
              setError(undefined);
            }}
          >
            采用最新版本，保留我的草稿
          </button>
        )}
        <button
          type="button"
          className="tl-button tl-button--primary"
          onClick={() => void submit()}
        >
          保存设置
        </button>
      </div>
    </ManagementDialog>
  );
}
