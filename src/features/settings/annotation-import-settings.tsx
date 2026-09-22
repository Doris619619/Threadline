/** @fileoverview 由用户明确把无账号归属的旧批注导入当前账号，保留原始数据。 */
'use client';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';

/** 展示导入数量、目标账号边界与可恢复错误。 */
export function AnnotationImportSettings() {
  const { annotationImport } = useWorkspaceData();
  if (!annotationImport) return null;
  return (
    <section className="settings-copy">
      <p>
        本机还有 {annotationImport.count}{' '}
        条旧批注可导入当前账号。原始数据会保留；无法确认任务归属的笔迹按原画布导入。
      </p>
      <button
        type="button"
        className="tl-button tl-button--secondary"
        disabled={!annotationImport.count}
        onClick={() => void annotationImport.importLegacy()}
      >
        导入旧批注到当前账号
      </button>
      {annotationImport.error && <p role="alert">{annotationImport.error}</p>}
    </section>
  );
}
