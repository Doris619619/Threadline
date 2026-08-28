/**
 * @fileoverview 冻结任务时间与时长输入的既有解析和展示行为，供任务视图复用。
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
  if (!clean || clean === '—' || clean === '-' || clean === '0' || clean === '0min') {
    return undefined;
  }
  const hourMinMatch = clean.match(
    /^(\d+(?:\.\d+)?)\s*h(?:our)?s?\s*(\d+)?(?:\s*m(?:in)?s?)?$/,
  );
  if (hourMinMatch) {
    const hours = parseFloat(hourMinMatch[1]);
    const mins = hourMinMatch[2] ? parseInt(hourMinMatch[2], 10) : 0;
    return Math.round(hours * 60 + mins);
  }
  const minMatch = clean.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)?$/);
  if (minMatch) return parseInt(minMatch[1], 10);
  return undefined;
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
    if (start && end && end >= start) {
      return { start, end, duration: calculateDuration(start, end) };
    }
    return { start, end };
  }
  return {};
}
