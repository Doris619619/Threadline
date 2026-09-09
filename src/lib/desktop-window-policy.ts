/**
 * @fileoverview 定义与桌面壳无关的窗口模式、geometry 归一化和显示器安全恢复策略。
 */

export type DesktopViewMode = 'full' | 'mini-today' | 'workstation';
export type CompactViewMode = Exclude<DesktopViewMode, 'full'>;
export type CompactPresentation = 'expanded' | 'edge-collapsed';

export interface WindowStateConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

/** 逻辑像素坐标系下的显示器工作区域。 */
export interface LogicalWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 定义三种业务窗口模式在没有 persisted geometry 时使用的默认尺寸。 */
export const DEFAULT_WINDOW_CONFIGS: Record<DesktopViewMode, WindowStateConfig> = {
  full: { width: 1280, height: 840 },
  'mini-today': { width: 200, height: 170 },
  workstation: { width: 200, height: 200 },
};

/** 定义 Edge 窗口在所有壳实现中必须保持一致的固定逻辑尺寸。 */
export const EDGE_TAB_SIZE = { width: 28, height: 104 };

/** 紧凑窗口的统一 logical px 尺寸边界，Main 与 Renderer 必须共用。 */
export const COMPACT_WINDOW_BOUNDS: Record<
  CompactViewMode,
  { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
> = {
  'mini-today': { minWidth: 200, maxWidth: 340, minHeight: 96, maxHeight: 170 },
  workstation: { minWidth: 200, maxWidth: 340, minHeight: 96, maxHeight: 220 },
};

const MINIMUM_VISIBLE_SIZE: Record<DesktopViewMode, { width: number; height: number }> =
  {
    full: { width: 240, height: 160 },
    'mini-today': { width: 80, height: 80 },
    workstation: { width: 80, height: 80 },
  };

const WINDOW_MARGIN = 24;

/** 将任意数值限制到安全闭区间，并统一为逻辑像素整数。 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.min(maximum, Math.max(minimum, value)));
}

/** 判断 geometry 是否携带可用于显示器可见性检查和原生定位的位置。 */
export function hasWindowPosition(
  state: WindowStateConfig,
): state is WindowStateConfig & Required<Pick<WindowStateConfig, 'x' | 'y'>> {
  return Number.isFinite(state.x) && Number.isFinite(state.y);
}

/** 将紧凑视图的历史 geometry 限制为可交互窗口尺寸，拒绝旧版本的异常尺寸。 */
export function normalizeCompactWindowState(
  mode: CompactViewMode,
  state?: WindowStateConfig,
): WindowStateConfig {
  const fallback = DEFAULT_WINDOW_CONFIGS[mode];
  const bounds = COMPACT_WINDOW_BOUNDS[mode];
  const width =
    typeof state?.width === 'number' && Number.isFinite(state.width)
      ? state.width
      : fallback.width;
  const height =
    typeof state?.height === 'number' && Number.isFinite(state.height)
      ? state.height
      : fallback.height;
  const normalized = {
    width:
      width > bounds.maxWidth
        ? fallback.width
        : clamp(width, bounds.minWidth, bounds.maxWidth),
    height: clamp(height, bounds.minHeight, bounds.maxHeight),
  };

  return state && hasWindowPosition(state)
    ? { ...normalized, x: Math.round(state.x), y: Math.round(state.y) }
    : normalized;
}

/** 过滤 persisted window state，只接受当前三种业务窗口模式的合法 geometry。 */
export function normalizeWindowStates(
  value: unknown,
): Partial<Record<DesktopViewMode, WindowStateConfig>> {
  if (!value || typeof value !== 'object') return {};

  const states = value as Partial<Record<DesktopViewMode, WindowStateConfig>>;
  const full = states.full;
  const normalizedFull =
    full &&
    Number.isFinite(full.width) &&
    Number.isFinite(full.height) &&
    full.width >= 800 &&
    full.height >= 560
      ? {
          width: Math.round(full.width),
          height: Math.round(full.height),
          ...(hasWindowPosition(full)
            ? { x: Math.round(full.x), y: Math.round(full.y) }
            : {}),
        }
      : undefined;

  return {
    ...(normalizedFull ? { full: normalizedFull } : {}),
    'mini-today': normalizeCompactWindowState('mini-today', states['mini-today']),
    workstation: normalizeCompactWindowState('workstation', states.workstation),
  };
}

/** 新进程读取偏好时让工作站从窄宽度开始；位置/高度和其他视图不变，运行中调宽仍使用通常的尺寸校验。 */
export function normalizeStartupWindowStates(
  value: unknown,
): Partial<Record<DesktopViewMode, WindowStateConfig>> {
  const states = normalizeWindowStates(value);
  return {
    ...states,
    workstation: {
      ...states.workstation!,
      width: DEFAULT_WINDOW_CONFIGS.workstation.width,
    },
  };
}

/** 判断窗口在任意工作区域内是否仍保留足够的可拖回可见矩形。 */
export function hasSufficientVisibleArea(
  mode: DesktopViewMode,
  state: WindowStateConfig,
  workAreas: LogicalWorkArea[],
): boolean {
  if (!hasWindowPosition(state)) return false;

  const minimum = MINIMUM_VISIBLE_SIZE[mode];
  return workAreas.some((area) => {
    const visibleWidth = Math.max(
      0,
      Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x),
    );
    const visibleHeight = Math.max(
      0,
      Math.min(state.y + state.height, area.y + area.height) -
        Math.max(state.y, area.y),
    );
    return visibleWidth >= minimum.width && visibleHeight >= minimum.height;
  });
}

/** 为当前工作区域创建居中 Full 或右上紧凑模式的安全恢复 geometry。 */
function getFallbackWindowState(
  mode: DesktopViewMode,
  state: WindowStateConfig,
  area: LogicalWorkArea,
): WindowStateConfig {
  const width = Math.min(state.width, Math.max(1, area.width - WINDOW_MARGIN * 2));
  const height = Math.min(state.height, Math.max(1, area.height - WINDOW_MARGIN * 2));
  const x =
    mode === 'full'
      ? area.x + Math.max(WINDOW_MARGIN, (area.width - width) / 2)
      : area.x + Math.max(WINDOW_MARGIN, area.width - width - WINDOW_MARGIN);
  const y =
    mode === 'full'
      ? area.y + Math.max(WINDOW_MARGIN, (area.height - height) / 2)
      : area.y + WINDOW_MARGIN;

  return {
    width: Math.round(width),
    height: Math.round(height),
    x: Math.round(x),
    y: Math.round(y),
  };
}

/**
 * 恢复 persisted geometry 前校验可见性；缺失屏幕、最小化哨兵值和 DPI 不匹配均回退到当前工作区。
 * 输入和输出始终使用 logical pixel，避免缩放比例下混用 physical pixel。
 */
export function resolveSafeWindowState(
  mode: DesktopViewMode,
  state: WindowStateConfig,
  workAreas: LogicalWorkArea[],
  preferredArea?: LogicalWorkArea | null,
): WindowStateConfig {
  if (hasSufficientVisibleArea(mode, state, workAreas)) return state;

  const fallbackArea = preferredArea ?? workAreas[0];
  return fallbackArea
    ? getFallbackWindowState(mode, state, fallbackArea)
    : { ...state };
}
