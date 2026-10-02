/** @fileoverview 组合阶段、项目和 Daily 的计划网格页，保留各管理器的原业务边界。 */

'use client';

import { Search, FolderKanban } from 'lucide-react';
import { useState, useRef, useLayoutEffect } from 'react';
import type { Daily } from '@/features/daily/types';
import { DailyTemplateManager } from '@/features/daily/daily-template-manager';
import { ProjectPanel } from '@/features/projects/project-panel';
import type { Project, Task } from '@/types/domain';
import { CottageNavIcon } from '@/features/appearance/cottage-sprite';
import { useOptionalStagePlans } from '@/features/stage-plans/state';
import {
  StageBoard,
  StageDetail,
  RestorePlanScroll,
} from '@/features/stage-plans/board';
import { StageEditor } from '@/features/stage-plans/editor';
import { stageStatus } from '@/features/stage-plans/rules';
import { useAccountToday } from '@/features/settings/account-timezone-provider';

type Status = 'archive' | 'restore' | 'delete';

/** 阶段、项目与 Daily 按固定顺序组合，详情使用同一工作台中的完整视图。 */
export function ProjectManagementPage({
  projects,
  tasks = [],
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
  tasks?: Task[];
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
  const stages = useOptionalStagePlans();
  const today = useAccountToday();
  const [creatingStage, setCreatingStage] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const search = stages?.search ?? localSearch;
  const [projectId, setProjectId] = useState<string>();
  const project = projects.find((item) => item.id === projectId);
  const projectReturn = useRef<
    { id: string; scroll: number; pending: boolean } | undefined
  >(undefined);
  /** 项目详情返回后恢复计划列表的搜索、阶段筛选、滚动和原卡片焦点。 */
  useLayoutEffect(() => {
    const saved = projectReturn.current;
    if (project || !saved?.pending) return;
    const main = document.querySelector('.tl-main');
    if (main) main.scrollTop = saved.scroll;
    window.scrollTo?.(0, saved.scroll);
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-project-card-id]'))
      .find((card) => card.dataset.projectCardId === saved.id)
      ?.focus({ preventScroll: true });
    saved.pending = false;
  }, [project]);
  /** 点击卡片进入完整任务总览；不改变工作日期或列表过滤条件。 */
  const openProject = (id: string) => {
    projectReturn.current = {
      id,
      scroll: Math.max(
        document.querySelector('.tl-main')?.scrollTop ?? 0,
        window.scrollY,
      ),
      pending: true,
    };
    setProjectId(id);
  };
  const projectPanel = (
    <ProjectPanel
      items={projects}
      tasks={tasks}
      search={search}
      onCreateProject={onCreateProject}
      onUpdateProject={onUpdateProject}
      onSetProjectArchived={onSetProjectArchived}
      onDeleteProject={onDeleteProject}
      onOpenProject={openProject}
      detailProject={project}
      onBackProject={() => setProjectId(undefined)}
    />
  );

  if (stages?.detailId) return <StageDetail key={stages.detailId} />;
  if (project) return projectPanel;
  return (
    <section className="project-panel" data-testid="project-panel">
      <header className="project-page-heading">
        <div>
          <h1>
            <span className="plan-page-icon">
              <CottageNavIcon name="projects">
                <FolderKanban size={30} />
              </CottageNavIcon>
            </span>
            计划
          </h1>
        </div>
        <div className="plan-heading-actions">
          <label className="plan-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索计划"
              placeholder="搜索计划…"
              value={search}
              onChange={(event) =>
                stages
                  ? stages.setSearch(event.target.value)
                  : setLocalSearch(event.target.value)
              }
            />
          </label>
        </div>
      </header>
      {stages && (
        <>
          <RestorePlanScroll />
          <StageBoard onCreate={() => setCreatingStage(true)} />
        </>
      )}
      {projectPanel}
      <DailyTemplateManager
        items={dailyTemplates}
        search={search}
        onCreate={onCreateDaily}
        onSave={onSaveDaily}
        onSetStatus={onSetDailyStatus}
        onSetItemStatus={onSetDailyItemStatus}
      />
      {creatingStage && stages && (
        <StageEditor
          projects={projects}
          onClose={() => setCreatingStage(false)}
          onSaved={(plan) => {
            stages.setSearch('');
            stages.setTab(stageStatus(plan, today));
          }}
        />
      )}
    </section>
  );
}
