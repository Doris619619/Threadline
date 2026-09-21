/** @fileoverview 自启动状态与可注入的系统控制器；系统状态为真源，决定记录只控制首次提示。 */
export type AutoStartState = { supported: boolean; enabled: boolean; decided: boolean };
export const unsupportedAutoStart: AutoStartState = {
  supported: false,
  enabled: false,
  decided: true,
};
type AutoStartDependencies = {
  supported: boolean;
  readEnabled: () => boolean;
  writeEnabled: (enabled: boolean) => void;
  readDecision: () => boolean;
  recordDecision: () => void;
};

/** 将系统 API 与决策标记组合，只有显式设置会改系统，“以后再选”保留已有开关。 */
export function createAutoStartController(dependencies: AutoStartDependencies) {
  /** 每次重新读取系统，尊重用户在任务管理器里的修改。 */
  const getState = (): AutoStartState =>
    dependencies.supported
      ? {
          supported: true,
          enabled: dependencies.readEnabled(),
          decided: dependencies.readDecision(),
        }
      : { ...unsupportedAutoStart };
  /** 校验布尔值后写入并回读；系统未接受时不记录成功。 */
  const setEnabled = (enabled: unknown): AutoStartState => {
    if (typeof enabled !== 'boolean') throw new Error('自启动设置必须为布尔值。');
    if (!dependencies.supported)
      throw new Error('请在 Windows 正式安装版中设置自启动。');
    dependencies.writeEnabled(enabled);
    if (dependencies.readEnabled() !== enabled)
      throw new Error('Windows 未能应用自启动设置，请重试。');
    dependencies.recordDecision();
    return getState();
  };
  /** 以后再选仅记住提示已处理，新安装保持系统默认关闭。 */
  const defer = (): AutoStartState => {
    if (dependencies.supported) dependencies.recordDecision();
    return getState();
  };
  return { getState, setEnabled, defer };
}
