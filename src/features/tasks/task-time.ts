/**
 * @fileoverview 统一任务时间解析、起止时间自动估时与可手动修改的预计分钟展示。
 */

import { calculateDuration } from '@/lib/task-rules';

/** 将分钟展示为既有的紧凑文本格式。 */
export function formatMinutes(value?: number) {
  if (value === undefined) return '—';
  return value < 60
    ? `${value}min`
    : `${Math.floor(value / 60)}h${value % 60 ? `${value % 60}min` : ''}`;
}

/**
 * 解析用户输入的持续时间字符串，不为跨功能调用添加新的输入语义。
 */
export function parseDurationInput(value: string): number | undefined {
  const clean = value.trim().toLowerCase();
  if (!clean || clean === '—' || clean === '-') return undefined;
  const hour = clean.match(/^(\d+(?:\.\d+)?)\s*(?:h(?:our)?s?|小时)$/);
  const mixed = clean.match(
    /^(\d+)\s*(?:h(?:our)?s?|小时)\s*(\d+)\s*(?:m(?:in)?s?|分钟)$/,
  );
  const minute = clean.match(/^(\d+)\s*(?:m|min|mins|minute|minutes|分钟)?$/);
  const result = hour
    ? Math.round(Number(hour[1]) * 60)
    : mixed
      ? Number(mixed[1]) * 60 + Number(mixed[2])
      : minute
        ? Number(minute[1])
        : NaN;
  if (!Number.isSafeInteger(result) || result < 0 || result > 2147483647)
    throw new Error('实际耗时请输入有效的非负分钟，如 30min 或 1h20min');
  return result;
}

/** 将紧凑时间输入标准化为两位小时和分钟；非法输入保持 undefined。 */
export function normalizeTime(value: string) {
  const clean = value.trim();
  const parsed = /^\d{3,4}$/.test(clean)
    ? `${clean.slice(0, -2)}:${clean.slice(-2)}`
    : clean;
  if (!/^\d{1,2}:\d{2}$/.test(parsed)) return undefined;
  const [h, m] = parsed.split(':').map(Number);
  return h < 24 && m < 60
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    : undefined;
}

/** 时间编辑时自动填入有效同日范围的预计分钟；缺失、同刻或跨日保留原估时供用户继续输入。 */
export function estimateFromTimeRange(
  startRaw: string,
  endRaw: string,
  previous: string,
): string {
  const start = normalizeTime(startRaw);
  const end = normalizeTime(endRaw);
  return start && end && end > start ? String(calculateDuration(start, end)) : previous;
}

/**
 * 解析单个时间或同日时间范围；跨午夜范围保持原行为，不自动计算 duration。
 */
export function parseTimeInput(value: string): {
  start?: string;
  end?: string;
  duration?: number;
} {
  const clean = value.trim();
  if (!clean) return {};
  const parts = clean.split(/[-–~至到\s]+/).filter(Boolean);
  if (parts.length === 1) return { start: normalizeTime(parts[0]) };
  if (parts.length >= 2) {
    const start = normalizeTime(parts[0]);
    const end = normalizeTime(parts[1]);
    if (start && end && end > start) {
      return { start, end, duration: calculateDuration(start, end) };
    }
    return { start, end };
  }
  return {};
}

/** 预计只接受非负整数分钟；空值为待定，非法输入不能静默清空旧值。 */
export function parseEstimateMinutes(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const minutes = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(minutes) || minutes > 2147483647)
    throw new Error('预计请输入非负整数分钟，或留空为待定');
  return minutes;
}
/** 预计空值有明确含义，实际耗时继续使用原有缺省展示。 */
export function formatEstimate(value?: number): string {
  return value === undefined ? '待定' : formatMinutes(value);
}
