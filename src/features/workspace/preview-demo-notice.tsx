/** @fileoverview 在预览工作台明确说明演示数据只保存在当前浏览器。 */

/** 使用常驻非模态说明，不打断手机和桌面的正常操作。 */
export function PreviewDemoNotice() {
  return (
    <aside className="preview-demo-notice" aria-label="演示模式说明">
      <strong>演示模式</strong>
      <span>可自由操作，数据仅保存在当前浏览器，不会同步到正式账号。</span>
    </aside>
  );
}
