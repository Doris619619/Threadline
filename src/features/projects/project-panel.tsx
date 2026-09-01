/** @fileoverview 渲染项目管理列表；Daily 模板管理由独立组件承担。 */

'use client';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project } from '@/types/domain';

type ProjectDialog = { project?: Project } | undefined;

/** 渲染项目的低频操作菜单，默认项目没有入口。 */
function ProjectMenu({
  project,
  onEdit,
  onArchive,
  onDelete,
}: {
  project: Project;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <details className="manager-menu">
      <summary aria-label={`${project.name}操作`}>
        <MoreHorizontal size={18} />
      </summary>
      <div>
        <button onClick={onEdit}>修改</button>
        <button onClick={onArchive}>
          {project.status === 'active' ? '归档' : '恢复'}
        </button>
        <button className="is-danger" onClick={onDelete}>
          删除
        </button>
      </div>
    </details>
  );
}

/** 渲染只包含名称、颜色和生命周期操作的项目管理区。 */
export function ProjectPanel({
  items,
  onCreateProject,
  onUpdateProject,
  onSetProjectArchived,
  onDeleteProject,
}: {
  items: Project[];
  onCreateProject: (project: Project) => Promise<unknown>;
  onUpdateProject: (id: string, name: string, color: string) => Promise<void>;
  onSetProjectArchived: (id: string, archived: boolean) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3979e8');
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
  /** 创建仅含项目元数据的新项目。 */
  const createProject = () =>
    void run(async () => {
      if (!name.trim()) throw new Error('请输入项目名称。');
      await onCreateProject({
        id: crypto.randomUUID(),
        name: name.trim(),
        color,
        status: 'active',
        position: Math.max(-1, ...items.map((item) => item.position ?? -1)) + 1,
        createdAt: getLocalDateKey(),
      });
      setName('');
    });
  /** 打开项目修改对话框并复制当前元数据到草稿。 */
  const openEdit = (project: Project) => {
    setDialog({ project });
    setDialogName(project.name);
    setDialogColor(project.color);
  };
  /** 保存项目名称和颜色，两个字段一起提交。 */
  const saveProject = () =>
    void run(async () => {
      if (!dialog?.project || !dialogName.trim()) throw new Error('请输入项目名称。');
      await onUpdateProject(dialog.project.id, dialogName.trim(), dialogColor);
      setDialog(undefined);
    });
  return (
    <section className="manager-section" aria-labelledby="project-manager-heading">
      <div className="manager-section-heading">
        <h2 id="project-manager-heading">项目</h2>
        <div className="manager-create">
          <Input
            aria-label="新项目名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="项目名称"
          />
          <input
            aria-label="项目颜色"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          <Button size="compact" onClick={createProject}>
            <Plus size={15} /> 新建项目
          </Button>
        </div>
      </div>
      <div className="manager-list">
        {items.map((project) => (
          <div className="manager-row" key={project.id}>
            <span className="project-dot" style={{ backgroundColor: project.color }} />
            <span className="manager-primary">{project.name}</span>
            <span className="manager-status">
              {project.isFallback
                ? '默认项目'
                : project.status === 'archived'
                  ? '已归档'
                  : '活跃'}
            </span>
            {!project.isFallback && (
              <ProjectMenu
                project={project}
                onEdit={() => openEdit(project)}
                onArchive={() =>
                  void run(() =>
                    onSetProjectArchived(project.id, project.status === 'active'),
                  )
                }
                onDelete={() => void run(() => onDeleteProject(project.id))}
              />
            )}
          </div>
        ))}
      </div>
      {dialog?.project && (
        <div className="manager-dialog-backdrop">
          <section className="manager-dialog" role="dialog" aria-modal="true">
            <header>
              <h2>修改项目</h2>
              <button aria-label="关闭" onClick={() => setDialog(undefined)}>
                ×
              </button>
            </header>
            <Input
              aria-label="项目名称"
              value={dialogName}
              onChange={(event) => setDialogName(event.target.value)}
            />
            <label className="manager-color-field">
              颜色
              <input
                aria-label="修改项目颜色"
                type="color"
                value={dialogColor}
                onChange={(event) => setDialogColor(event.target.value)}
              />
            </label>
            <footer>
              <Button variant="quiet" onClick={() => setDialog(undefined)}>
                取消
              </Button>
              <Button onClick={saveProject}>保存</Button>
            </footer>
          </section>
        </div>
      )}
      {error && (
        <p className="workspace-sync-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
