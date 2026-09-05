/** @fileoverview 统一云端、自动 Preview 演示和显式本地测试的数据来源选择。 */

/** 此标记只由 next.config 根据 Vercel Preview 与空云配置推导。 */
export function isPreviewDemo(): boolean {
  return process.env.NEXT_PUBLIC_THREADLINE_PREVIEW_DEMO === 'true';
}

/** 演示和自动化测试共用本地业务适配器，正式环境仍由云登录门禁接管。 */
export function usesLocalWorkspace(): boolean {
  return isPreviewDemo() || process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER === 'true';
}

/** 演示状态使用独立命名空间，避免读取历史本地任务或与测试数据混用。 */
export function workspaceStorageKey(key: string): string {
  return isPreviewDemo() ? `threadline.preview-demo.v1:${key}` : key;
}
