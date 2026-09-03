/** @fileoverview 渲染项目管理列表；Daily 模板管理由独立组件承担。 */

'use client';

import { ChevronRight } from 'lucide-react';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project } from '@/types/domain';

type ProjectDialog =
  | { mode: 'create' }
  | { mode: 'edit'; project: Project }
  | { mode: 'manage'; project: Project }
  | undefined;
type ProjectPanelProps = {
  items: Project[];
  onCreateProject: (project: Project) => Promise<unknown>;
  onUpdateProject: (id: string, name: string, color: string) => Promise<void>;
  onSetProjectArchived: (id: string, archived: boolean) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
};

/** 暴露项目创建入口给项目页头，不让页头重复实现项目表单业务。 */
export type ProjectPanelHandle = { openCreate: () => void };

/** 渲染只包含名称、颜色和生命周期操作的项目管理区。 */
export const ProjectPanel = forwardRef<ProjectPanelHandle, ProjectPanelProps>(
  function ProjectPanel(
    { items, onCreateProject, onUpdateProject, onSetProjectArchived, onDeleteProject },
    ref,
  ) {
    const [dialog, setDialog] = useState<ProjectDialog>();
    const [dialogName, setDialogName] = useState('');
    const [dialogColor, setDialogColor] = useState('#3979e8');
    const [error, setError] = useState<string>();
    /** 执行云端写入并将失败原因保留在管理页。 */
    const run = async (action: () => Promise<void>) => {
      try {
        setError(undefined);
        await action();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '保存失败，请重试。');
      }
    };
    /** 关闭项目 Dialog 并清理草稿；共享 Dialog 会把焦点还给触发按钮。 */
    const closeDialog = () => {
      setDialog(undefined);
      setDialogName('');
      setDialogColor('#3979e8');
    };
    /** 打开新建项目 Dialog，并以稳定的蓝色作为未选择颜色时的默认值。 */
    const openCreate = () => {
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

    /** 将已有项目创建逻辑以受限 handle 交给唯一页面入口调用。 */
    useImperativeHandle(ref, () => ({ openCreate }));

    return (
      <section className="manager-section" aria-labelledby="project-manager-heading">
        <div className="manager-section-heading">
          <h2 id="project-manager-heading">
            我的项目 <span>{items.length}</span>
          </h2>
        </div>
        <div className="manager-card manager-card--projects">
          <div className="manager-list manager-list--projects">
            {items.map((project) => (
              <button
                aria-label={`管理项目 ${project.name}`}
                className="manager-row"
                key={project.id}
                onClick={() => setDialog({ mode: 'manage', project })}
                type="button"
              >
                <span
                  className="project-dot"
                  style={{ backgroundColor: project.color }}
                />
                <span className="manager-primary">{project.name}</span>
                {project.status === 'archived' && !project.isFallback && (
                  <span className="manager-status">已归档</span>
                )}
                <ChevronRight
                  aria-hidden="true"
                  className="manager-row-chevron"
                  size={20}
                />
              </button>
            ))}
          </div>
        </div>
        {dialog && (
          <ManagementDialog
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
        {error && (
          <p className="workspace-sync-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  },
);
