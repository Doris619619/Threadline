/** @fileoverview 组合项目与 Daily 模板管理区，形成侧栏“项目”的唯一管理页面。 */

'use client';

import { CalendarPlus, FolderPlus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Daily } from '@/features/daily/types';
import {
  DailyTemplateManager,
  type DailyTemplateManagerHandle,
} from '@/features/daily/daily-template-manager';
import {
  ProjectPanel,
  type ProjectPanelHandle,
} from '@/features/projects/project-panel';
import type { Project } from '@/types/domain';

type Status = 'archive' | 'restore' | 'delete';
type CreateTarget = 'project' | 'daily';

/**
 * 渲染项目页唯一的新建入口；选择类型后把焦点交还给入口，供后续业务 Dialog 关闭时恢复。
 */
function ProjectCreateMenu({ onChoose }: { onChoose: (target: CreateTarget) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /** 在菜单以外按下指针或 Escape 时关闭浮层，避免它遮挡页面内容。 */
  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target))
        setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  /** 关闭选择菜单后请求相应 Dialog，并稳定保留触发控件作为焦点恢复点。 */
  const choose = (target: CreateTarget) => {
    triggerRef.current?.focus();
    setIsOpen(false);
    onChoose(target);
  };

  return (
    <div className="project-create-menu" ref={menuRef}>
      <button
        aria-controls="project-create-actions"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="新建"
        className="project-create-trigger"
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <Plus aria-hidden="true" size={24} strokeWidth={1.8} />
        <span>新建</span>
      </button>
      {isOpen && (
        <div
          aria-label="新建项目或 Daily"
          className="project-create-actions"
          id="project-create-actions"
          role="menu"
        >
          <button onClick={() => choose('project')} role="menuitem" type="button">
            <FolderPlus aria-hidden="true" size={18} />
            新建项目
          </button>
          <button onClick={() => choose('daily')} role="menuitem" type="button">
            <CalendarPlus aria-hidden="true" size={18} />
            新建 Daily
          </button>
        </div>
      )}
    </div>
  );
}

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
  const projectPanelRef = useRef<ProjectPanelHandle>(null);
  const dailyTemplateManagerRef = useRef<DailyTemplateManagerHandle>(null);

  /** 将唯一页头入口路由到各自保留业务逻辑的现有创建 Dialog。 */
  const requestCreate = (target: CreateTarget) => {
    if (target === 'project') projectPanelRef.current?.openCreate();
    else dailyTemplateManagerRef.current?.openCreate();
  };

  return (
    <section className="project-panel" data-testid="project-panel">
      <header className="project-page-heading">
        <div>
          <h1>项目</h1>
          <p>管理长期事项与 Daily 模板</p>
        </div>
        <ProjectCreateMenu onChoose={requestCreate} />
      </header>
      <ProjectPanel
        items={projects}
        onCreateProject={onCreateProject}
        onUpdateProject={onUpdateProject}
        onSetProjectArchived={onSetProjectArchived}
        onDeleteProject={onDeleteProject}
        ref={projectPanelRef}
      />
      <DailyTemplateManager
        items={dailyTemplates}
        onCreate={onCreateDaily}
        onSave={onSaveDaily}
        onSetStatus={onSetDailyStatus}
        onSetItemStatus={onSetDailyItemStatus}
        ref={dailyTemplateManagerRef}
      />
    </section>
  );
}
