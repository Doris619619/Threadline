/** @fileoverview 提供首页智能导入入口及成功后的轻量提示，与 Web、PWA 和 Electron 共用。 */

'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, Sparkles, X } from 'lucide-react';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import type { Project, Task } from '@/types/domain';
import { SmartImportDialog } from './dialog';

/** 入口只在打开时挂载解析草稿，关闭后释放文本；成功提示自动收起且可手动关闭。 */
export function SmartImportAction({
  projects,
  selectedDate,
  createTask,
}: {
  projects: Project[];
  selectedDate: string;
  createTask: (task: Task) => Promise<Task>;
}) {
  const runtime = useOptionalCloudRuntime();
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState<number>();
  useEffect(() => {
    if (imported === undefined) return;
    const timeout = setTimeout(() => setImported(undefined), 5000);
    return () => clearTimeout(timeout);
  }, [imported]);
  /** 只在全部选中项获得真实保存确认后关闭弹窗并报告数量。 */
  const success = (count: number) => {
    setOpen(false);
    setImported(count);
  };
  return (
    <>
      <button
        type="button"
        className="add-link smart-import-trigger"
        onClick={() => setOpen(true)}
      >
        <Sparkles size={17} aria-hidden="true" />
        智能导入
      </button>
      {open && (
        <SmartImportDialog
          client={runtime?.client}
          projects={projects}
          selectedDate={selectedDate}
          createTask={createTask}
          onClose={() => setOpen(false)}
          onSuccess={success}
        />
      )}
      {imported !== undefined && (
        <div className="smart-import-toast" role="status">
          <CircleCheck size={22} aria-hidden="true" />
          <span>已成功导入 {imported} 条任务</span>
          <button
            type="button"
            aria-label="关闭导入提示"
            onClick={() => setImported(undefined)}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
