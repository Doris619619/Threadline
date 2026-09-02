/** @fileoverview 组合项目与 Daily 模板管理区，形成侧栏“项目”的唯一管理页面。 */

'use client';

import type { Daily } from '@/features/daily/types';
import { DailyTemplateManager } from '@/features/daily/daily-template-manager';
import { ProjectPanel } from '@/features/projects/project-panel';
import type { Project } from '@/types/domain';

type Status = 'archive' | 'restore' | 'delete';

/** 将两个独立管理器放在同一信息架构页面，避免两者共享不应存在的数据依赖。 */
export function ProjectManagementPage({
  projects,
  dailyTemplates,
  onCreateProject,
  onUpdateProject,
  onSetProjectArchived,
  onDeleteProject,
  onCreateDaily,
  onSaveDaily,
  onSetDailyStatus,
  onSetDailyItemStatus,
}: {
  projects: Project[];
  dailyTemplates: Daily[];
  onCreateProject: (project: Project) => Promise<unknown>;
  onUpdateProject: (id: string, name: string, color: string) => Promise<void>;
  onSetProjectArchived: (id: string, archived: boolean) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onCreateDaily: (daily: Daily) => Promise<void>;
  onSaveDaily: (daily: Daily) => Promise<void>;
  onSetDailyStatus: (id: string, status: Status) => Promise<void>;
  onSetDailyItemStatus: (id: string, status: Status) => Promise<void>;
}) {
  return (
    <main className="project-panel" data-testid="project-panel">
      <header className="manager-heading">
        <h1>项目</h1>
        <p>管理项目与独立的 Daily 模板。</p>
      </header>
      <ProjectPanel
        items={projects}
        onCreateProject={onCreateProject}
        onUpdateProject={onUpdateProject}
        onSetProjectArchived={onSetProjectArchived}
        onDeleteProject={onDeleteProject}
      />
      <DailyTemplateManager
        items={dailyTemplates}
        onCreate={onCreateDaily}
        onSave={onSaveDaily}
        onSetStatus={onSetDailyStatus}
        onSetItemStatus={onSetDailyItemStatus}
      />
    </main>
  );
}
