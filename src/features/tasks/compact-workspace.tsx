/** @fileoverview 便签尺寸的工作站列表；任务编辑交给完整工作台，工作站只保存引用。 */
'use client';
import { WorkstationRow } from './components/workstation-row';
import { ProjectTag } from '@/components/ui/project-tag';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { useCompactContentHeight } from './hooks/use-compact-content-height';
import type { Project, Task } from '@/types/domain';

/** 项目与标题紧邻；完整名称由浏览器提示和详情入口提供。 */
function CompactTaskLabel({ task, projects }: { task: Task; projects: Project[] }) {
  const project = projects.find((item) => item.id === task.projectId);
  return (
    <span
      className="compact-task-label"
      title={`${project?.name ?? '其他'} · ${task.title}`}
    >
      <ProjectTag name={project?.name ?? '其他'} color={project?.color ?? '#8793a7'} />
      <strong>{task.title}</strong>
    </span>
  );
}

/** 通过有序 task ID 解析工作站，并由上层唯一 header 提供清空与模式操作。 */
export function WorkstationPanel({
  tasks,
  projects,
  workstationTaskIds,
  onToggleWorkstation,
  onReorderWorkstation,
}: {
  tasks: Task[];
  projects: Project[];
  workstationTaskIds: string[];
  onToggleWorkstation: (id: string) => void;
  onReorderWorkstation: (source: string, target: string) => void;
}) {
  const { setMode } = useDesktopWindow();
  const contentRef = useCompactContentHeight('workstation');
  const items = workstationTaskIds
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is Task => Boolean(task));
  return (
    <section
      className="compact-workspace workstation-panel"
      data-testid="workstation-panel"
    >
      <div className="compact-scroll">
        <ol ref={contentRef}>
          {items.length ? (
            items.map((task, index) => (
              <WorkstationRow
                key={task.id}
                task={task}
                index={index}
                label={<CompactTaskLabel task={task} projects={projects} />}
                onRemove={onToggleWorkstation}
                onReorder={onReorderWorkstation}
              />
            ))
          ) : (
            <li className="compact-empty">暂无工作站任务</li>
          )}
        </ol>
      </div>
      <button
        type="button"
        className="compact-full-link"
        onClick={() => void setMode('full')}
      >
        打开完整工作台
      </button>
    </section>
  );
}
