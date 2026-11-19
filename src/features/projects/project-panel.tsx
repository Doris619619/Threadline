/** @fileoverview 项目卡片与详情共用附近操作菜单；编辑和删除确认保留表单 Dialog 与原异步命令。 */

'use client';

import { ChevronRight, FolderKanban, MoreHorizontal } from 'lucide-react';
import { CottageNavIcon } from '@/features/appearance/cottage-sprite';
import { PlanObjectIcon } from '@/features/stage-plans/object-icon';
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { Input } from '@/components/ui/input';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';
import { ProjectDetail } from './project-detail';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { useTaskMenu } from '@/features/tasks/hooks/use-task-menu';

type ProjectDialog =
  | { mode: 'create' }
  | { mode: 'edit'; project: Project }
  | { mode: 'delete'; project: Project }
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

/** 项目入口只展开命令菜单；进入表单前聚焦真实触发器，保证 Safari 关闭表单后可正确归焦。 */
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
    const menu = useTaskMenu();
    const menuId = useId();
    const [management, setManagement] = useState<{
      project: Project;
      anchor: HTMLButtonElement;
      source: 'card' | 'manage' | 'detail';
    }>();
    const menuAnchor = useMemo(
      () => ({ current: management?.anchor ?? null }),
      [management],
    );
    const { busy, error, setError, run } = useGuardedAction();
    const completedActionFocus = useRef<HTMLButtonElement | null>(null);
    /** 原命令结束且触发器重新启用后归焦，避免菜单卸载早于 disabled 更新而把焦点留在 body。 */
    useLayoutEffect(() => {
      if (busy || !completedActionFocus.current) return;
      const trigger = completedActionFocus.current;
      completedActionFocus.current = null;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }, [busy]);
    /** 关闭项目 Dialog 并清理草稿；共享 Dialog 会把焦点还给触发按钮。 */
    const closeDialog = () => {
      setDialog(undefined);
      setDialogName('');
      setDialogColor('#3979e8');
    };
    /** 点击时先记住真实触发器；外部 handle 调用保留当前焦点，创建草稿仍使用原默认蓝色。 */
    const openCreate = (event?: MouseEvent<HTMLButtonElement>) => {
      event?.currentTarget.focus({ preventScroll: true });
      menu.close();
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
    /** 保存实际按钮作为菜单锚点；同入口再次点击收起，切换入口重新定位但不叠加浮层。 */
    const openManagement = (
      event: MouseEvent<HTMLButtonElement>,
      project: Project,
      source: 'card' | 'manage' | 'detail' = 'manage',
    ) => {
      if (busy) return;
      const sameAnchor = management?.anchor === event.currentTarget;
      event.currentTarget.focus({ preventScroll: true });
      setError(undefined);
      setManagement({ project, anchor: event.currentTarget, source });
      if (!menu.open || sameAnchor) menu.toggle();
    };
    /** 先归焦持久存在的触发器再卸载菜单，表单保存的返回目标不会成为已移除的 menuitem。 */
    const leaveMenuForDialog = () => {
      menuAnchor.current?.focus({ preventScroll: true });
      menu.close();
    };
    /** 打开项目修改对话框并复制元数据；切换表面前保留真实管理按钮焦点。 */
    const openEdit = (project: Project) => {
      leaveMenuForDialog();
      setError(undefined);
      setDialog({ mode: 'edit', project });
      setDialogName(project.name);
      setDialogColor(project.color);
    };
    /** 删除菜单项仅请求确认，不执行删除；原回调只由确认按钮触发。 */
    const openDelete = (project: Project) => {
      leaveMenuForDialog();
      setError(undefined);
      setDialog({ mode: 'delete', project });
    };
    /** 保存项目名称和颜色，两个字段一起提交。 */
    const saveProject = () =>
      void run(async () => {
        if (dialog?.mode !== 'edit' || !dialogName.trim())
          throw new Error('请输入项目名称。');
        await onUpdateProject(dialog.project.id, dialogName.trim(), dialogColor);
        closeDialog();
      });
    /** 生命周期命令成功才关闭当前菜单或确认框；失败保留原上下文和错误，guard 同步拦截重复请求。 */
    const runManagementAction = (action: () => Promise<void>) =>
      void run(async () => {
        await action();
        completedActionFocus.current = menuAnchor.current;
        menu.close();
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
            onManage={(event) => openManagement(event, detailProject, 'detail')}
            managementOpen={menu.open && management?.source === 'detail'}
            managementMenuId={menuId}
            managementBusy={busy}
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
              <button
                type="button"
                className="plan-create-link"
                disabled={busy}
                onClick={openCreate}
              >
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
                        disabled={busy}
                        aria-haspopup={!onOpenProject ? 'menu' : undefined}
                        aria-expanded={
                          !onOpenProject
                            ? menu.open &&
                              management?.project.id === project.id &&
                              management.source === 'card'
                            : undefined
                        }
                        aria-controls={
                          !onOpenProject &&
                          menu.open &&
                          management?.project.id === project.id &&
                          management.source === 'card'
                            ? menuId
                            : undefined
                        }
                        onClick={(event) => {
                          if (onOpenProject) onOpenProject(project.id);
                          else openManagement(event, project, 'card');
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
                        aria-haspopup="menu"
                        aria-expanded={
                          menu.open &&
                          management?.project.id === project.id &&
                          management.source === 'manage'
                        }
                        aria-controls={
                          menu.open &&
                          management?.project.id === project.id &&
                          management.source === 'manage'
                            ? menuId
                            : undefined
                        }
                        disabled={busy}
                        onClick={(event) => openManagement(event, project)}
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
        {menu.open && management && (
          <TaskActionsPopover
            anchor={menuAnchor}
            id={menuId}
            label={`${management.project.name}项目操作`}
            role="menu"
            onClose={menu.close}
          >
            <div role="group" aria-label="项目命令" aria-busy={busy}>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => openEdit(management.project)}
              >
                修改项目…
              </button>
              {!management.project.isFallback && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() =>
                      runManagementAction(() =>
                        onSetProjectArchived(
                          management.project.id,
                          management.project.status === 'active',
                        ),
                      )
                    }
                  >
                    {management.project.status === 'active' ? '归档项目' : '恢复项目'}
                  </button>
                  <hr role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={busy}
                    onClick={() => openDelete(management.project)}
                  >
                    删除项目…
                  </button>
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </TaskActionsPopover>
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
                  : '删除项目'
            }
          >
            {dialog.mode === 'delete' ? (
              <>
                <p>删除“{dialog.project.name}”后，项目中的任务会保留并移到默认项目。</p>
                <footer>
                  <Button
                    variant="quiet"
                    data-management-initial-focus
                    onClick={closeDialog}
                  >
                    取消
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      runManagementAction(() => onDeleteProject(dialog.project.id))
                    }
                  >
                    删除项目
                  </Button>
                </footer>
              </>
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
        {error && !dialog && !menu.open && (
          <p className="workspace-sync-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  },
);
