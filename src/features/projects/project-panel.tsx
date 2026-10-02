/** @fileoverview 渲染紧凑项目卡片，沿用原创建、编辑与生命周期管理；Daily 独立维护。 */

'use client';

import { ChevronRight, FolderKanban, MoreHorizontal } from 'lucide-react';
import { CottageNavIcon } from '@/features/appearance/cottage-sprite';
import { PlanObjectIcon } from '@/features/stage-plans/object-icon';
import { forwardRef, useImperativeHandle, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { Input } from '@/components/ui/input';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';
import { ProjectDetail } from './project-detail';

type ProjectDialog =
  | { mode: 'create' }
  | { mode: 'edit'; project: Project }
  | { mode: 'manage'; project: Project }
  | undefined;
type ProjectPanelProps = {
  items: Project[];
  tasks?: Task[];
  search?: string;
  onCreateProject: (project: Project) => Promise<unknown>;
  onUpdateProject: (id: string, name: string, color: string) => Promise<void>;
  onSetProjectArchived: (id: string, archived: boolean) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onOpenProject?: (id: string) => void;
  detailProject?: Project;
  onBackProject?: () => void;
};

/** 保留受限创建 handle，供其他组合视图复用现有项目表单。 */
export type ProjectPanelHandle = { openCreate: () => void };

/** 项目卡片进入原 Task 总览；独立管理入口保持名称、颜色和生命周期命令。 */
export const ProjectPanel = forwardRef<ProjectPanelHandle, ProjectPanelProps>(
  function ProjectPanel(
    {
      items,
      tasks = [],
      search = '',
      onCreateProject,
      onUpdateProject,
      onSetProjectArchived,
      onDeleteProject,
      onOpenProject,
      detailProject,
      onBackProject,
    },
    ref,
  ) {
    const [dialog, setDialog] = useState<ProjectDialog>();
    const [dialogName, setDialogName] = useState('');
    const [dialogColor, setDialogColor] = useState('#3979e8');
    const { busy, error, setError, run } = useGuardedAction();
    /** 关闭项目 Dialog 并清理草稿；共享 Dialog 会把焦点还给触发按钮。 */
    const closeDialog = () => {
      setDialog(undefined);
      setDialogName('');
      setDialogColor('#3979e8');
    };
    /** 打开新建项目 Dialog，并以稳定的蓝色作为未选择颜色时的默认值。 */
    const openCreate = () => {
      setError(undefined);
      setDialog({ mode: 'create' });
      setDialogName('');
      setDialogColor('#3979e8');
    };
    /** 创建仅含项目元数据的新项目。 */
    const createProject = () =>
      void run(async () => {
        if (!dialogName.trim()) throw new Error('请输入项目名称。');
        await onCreateProject({
          id: crypto.randomUUID(),
          name: dialogName.trim(),
          color: dialogColor,
          status: 'active',
          position: Math.max(-1, ...items.map((item) => item.position ?? -1)) + 1,
          createdAt: getLocalDateKey(),
        });
        closeDialog();
      });
    /** 打开项目修改对话框并复制当前元数据到草稿。 */
    const openEdit = (project: Project) => {
      setError(undefined);
      setDialog({ mode: 'edit', project });
      setDialogName(project.name);
      setDialogColor(project.color);
    };
    /** 保存项目名称和颜色，两个字段一起提交。 */
    const saveProject = () =>
      void run(async () => {
        if (dialog?.mode !== 'edit' || !dialogName.trim())
          throw new Error('请输入项目名称。');
        await onUpdateProject(dialog.project.id, dialogName.trim(), dialogColor);
        closeDialog();
      });
    /** 执行项目生命周期操作后关闭管理 sheet；失败时保留错误而不丢失上下文。 */
    const runManagementAction = (action: () => Promise<void>) =>
      void run(async () => {
        await action();
        closeDialog();
      });

    /** 外部调用与区域按钮复用同一创建逻辑。 */
    useImperativeHandle(ref, () => ({ openCreate }));

    return (
      <section
        className={detailProject ? 'project-panel' : 'manager-section plan-section'}
        aria-labelledby={detailProject ? undefined : 'project-manager-heading'}
      >
        {detailProject ? (
          <ProjectDetail
            key={detailProject.id}
            project={detailProject}
            onBack={() => onBackProject?.()}
            onManage={() => {
              setError(undefined);
              setDialog({ mode: 'manage', project: detailProject });
            }}
          />
        ) : (
          <>
            <div className="manager-section-heading plan-section-heading">
              <div>
                <h2 id="project-manager-heading">
                  <CottageNavIcon name="projects">
                    <FolderKanban size={23} />
                  </CottageNavIcon>
                  项目 <span>{items.length}</span>
                </h2>
                <p>管理长期目标与任务，专注于持续推进的方向。</p>
              </div>
              <button type="button" className="plan-create-link" onClick={openCreate}>
                + 新建项目
              </button>
            </div>
            <div className="manager-card manager-card--projects">
              <div className="manager-list manager-list--projects">
                {items
                  .filter((project) =>
                    project.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                  )
                  .map((project) => (
                    <article
                      className="manager-row project-grid-card"
                      style={
                        {
                          '--project-color': project.color,
                          backgroundColor:
                            'color-mix(in srgb, ' +
                            project.color +
                            ' 6%, var(--surface))',
                        } as CSSProperties
                      }
                      key={project.id}
                    >
                      <button
                        className="project-card-main"
                        type="button"
                        data-project-card-id={project.id}
                        aria-label={`查看项目 ${project.name}`}
                        onClick={() => {
                          if (onOpenProject) onOpenProject(project.id);
                          else setDialog({ mode: 'manage', project });
                        }}
                      >
                        <PlanObjectIcon name={project.name} kind="project" />
                        <span className="manager-primary">{project.name}</span>
                        <span className="project-task-count">
                          {tasks.filter((task) => task.projectId === project.id).length}{' '}
                          个任务
                        </span>
                        {project.status === 'archived' && !project.isFallback && (
                          <span className="manager-status">已归档</span>
                        )}
                        <ChevronRight
                          aria-hidden="true"
                          className="manager-row-chevron"
                          size={20}
                        />
                      </button>
                      <button
                        className="project-card-manage"
                        aria-label={`管理项目 ${project.name}`}
                        onClick={() => {
                          setError(undefined);
                          setDialog({ mode: 'manage', project });
                        }}
                        type="button"
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </button>
                    </article>
                  ))}
              </div>
            </div>
          </>
        )}
        {dialog && (
          <ManagementDialog
            busy={busy}
            error={error}
            key={dialog.mode}
            onClose={closeDialog}
            title={
              dialog.mode === 'create'
                ? '新建项目'
                : dialog.mode === 'edit'
                  ? '修改项目'
                  : dialog.project.name
            }
          >
            {dialog.mode === 'manage' ? (
              <div className="manager-action-list">
                <Button
                  data-management-initial-focus
                  variant="quiet"
                  onClick={() => openEdit(dialog.project)}
                >
                  修改项目
                </Button>
                {!dialog.project.isFallback && (
                  <>
                    <Button
                      variant="quiet"
                      onClick={() =>
                        runManagementAction(() =>
                          onSetProjectArchived(
                            dialog.project.id,
                            dialog.project.status === 'active',
                          ),
                        )
                      }
                    >
                      {dialog.project.status === 'active' ? '归档项目' : '恢复项目'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        runManagementAction(() => onDeleteProject(dialog.project.id))
                      }
                    >
                      删除项目
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                <Input
                  aria-label="项目名称"
                  data-management-initial-focus
                  value={dialogName}
                  onChange={(event) => setDialogName(event.target.value)}
                  placeholder="项目名称"
                />
                <label className="manager-color-field">
                  颜色
                  <input
                    aria-label={dialog.mode === 'create' ? '项目颜色' : '修改项目颜色'}
                    type="color"
                    value={dialogColor}
                    onChange={(event) => setDialogColor(event.target.value)}
                  />
                </label>
                <footer>
                  <Button variant="quiet" onClick={closeDialog}>
                    取消
                  </Button>
                  <Button
                    onClick={dialog.mode === 'create' ? createProject : saveProject}
                  >
                    {dialog.mode === 'create' ? '创建' : '保存'}
                  </Button>
                </footer>
              </>
            )}
          </ManagementDialog>
        )}
        {error && !dialog && (
          <p className="workspace-sync-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  },
);
