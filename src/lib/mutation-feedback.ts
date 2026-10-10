/** @fileoverview 保留异步写入错误至确认成功，隔离并发操作产生的较新错误。 */

export type MutationFeedback = {
  begin: () => () => void;
  report: (message: string) => void;
};

/** 每次开始捕获错误版本；成功只能清理开始时已有的反馈，不能吞掉随后出现的失败。 */
export function createMutationFeedback(
  onError: (message: string | undefined) => void,
): MutationFeedback {
  let revision = 0;
  return {
    /** 开始请求只捕获版本，保留旧错误供当前界面继续展示。 */
    begin: () => {
      const startedAt = revision;
      /** 确认成功只清理同一反馈版本，保留随后报告的失败与收尾警告。 */
      return () => {
        if (revision === startedAt) onError(undefined);
      };
    },
    /** 每个失败或警告推进共享版本，使此前请求不能清掉这条新反馈。 */
    report: (message) => {
      revision += 1;
      onError(message);
    },
  };
}
