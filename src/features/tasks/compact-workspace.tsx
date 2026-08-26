/** @fileoverview 迷你今日与工作站的独立紧凑 UI，只引用任务数据，不复用完整 TaskLine DOM。 */

'use client';

import { GripVertical, Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import type { Project, Task } from '@/types/domain';

type CompactWorkspaceProps = { timed: Task[]; quick: Task[]; projects: Project[]; workstationTaskIds: string[]; onUpdateTask: (task: Task) => void; onToggleWorkstation: (taskId: string) => void; onClearWorkstation: () => void; onReorderWorkstation: (sourceId: string, targetId: string) => void; };
/** 格式化紧凑面板中可扫读的轻量时长。 */
function compactDuration(minutes?: number): string { if (!minutes) return ''; const hours = Math.floor(minutes / 60); return hours ? `${hours}h${minutes % 60 ? `${minutes % 60}min` : ''}` : `${minutes}min`; }
/** 从动态项目集合查找标签，缺失项目保留可读的兜底标签。 */
function findProject(task: Task, projects: Project[]): Project { return projects.find((project) => project.id === task.projectId) ?? { id: 'missing', name: '其他', color: '#8793a7', status: 'active', createdAt: '' }; }

/** 迷你今日的一条时间任务：显示时间、项目、标题、时长和工作站引用按钮。 */
function MiniScheduleRow({ task, projects, inWorkstation, onUpdateTask, onToggleWorkstation }: { task: Task; projects: Project[]; inWorkstation: boolean; onUpdateTask: (task: Task) => void; onToggleWorkstation: (taskId: string) => void; }) {
  const project = findProject(task, projects);
  return <li className={`mini-task-row${task.completed ? ' completed' : ''}`}><time>{task.plannedStartTime ?? '待填'}</time><Checkbox aria-label={`完成${task.title}`} checked={task.completed} onChange={(event) => onUpdateTask({ ...task, completed: event.target.checked, completedAt: event.target.checked ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() })} /><div><ProjectTag name={project.name} color={project.color} /><strong>{task.title}</strong></div><small>{compactDuration(task.plannedDurationMinutes)}</small><button type="button" className={`workstation-toggle${inWorkstation ? ' is-active' : ''}`} aria-label={`${inWorkstation ? '从工作站移除' : '加入工作站'}${task.title}`} title={inWorkstation ? '从工作站移除' : '加入工作站'} onClick={() => onToggleWorkstation(task.id)}><Plus size={15} /></button></li>;
}
/** 迷你今日的一条无时间待办，保留完成与工作站维护能力。 */
function MiniQuickRow({ task, projects, inWorkstation, onUpdateTask, onToggleWorkstation }: { task: Task; projects: Project[]; inWorkstation: boolean; onUpdateTask: (task: Task) => void; onToggleWorkstation: (taskId: string) => void; }) {
  const project = findProject(task, projects);
  return <li className={`mini-quick-row${task.completed ? ' completed' : ''}`}><Checkbox aria-label={`完成${task.title}`} checked={task.completed} onChange={(event) => onUpdateTask({ ...task, completed: event.target.checked, completedAt: event.target.checked ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() })} /><div><ProjectTag name={project.name} color={project.color} /><strong>{task.title}</strong></div><button type="button" className={`workstation-toggle${inWorkstation ? ' is-active' : ''}`} aria-label={`${inWorkstation ? '从工作站移除' : '加入工作站'}${task.title}`} title={inWorkstation ? '从工作站移除' : '加入工作站'} onClick={() => onToggleWorkstation(task.id)}><Plus size={15} /></button></li>;
}

/** 渲染今日日程和无时间待办，避免依赖完整列表的 nth-child CSS 隐藏。 */
export function MiniTodayPanel(props: CompactWorkspaceProps) {
  const { setMode } = useDesktopWindow(); const has = (id: string) => props.workstationTaskIds.includes(id);
  return <section className="compact-workspace mini-today-panel" data-testid="mini-today-panel"><div className="compact-section"><h2>今日日程</h2><ul>{props.timed.length ? props.timed.map((task) => <MiniScheduleRow key={task.id} task={task} projects={props.projects} inWorkstation={has(task.id)} onUpdateTask={props.onUpdateTask} onToggleWorkstation={props.onToggleWorkstation} />) : <li className="compact-empty">今天还没有已排程任务。</li>}</ul></div><div className="compact-section"><h2>无时间待办</h2><ul>{props.quick.length ? props.quick.map((task) => <MiniQuickRow key={task.id} task={task} projects={props.projects} inWorkstation={has(task.id)} onUpdateTask={props.onUpdateTask} onToggleWorkstation={props.onToggleWorkstation} />) : <li className="compact-empty">暂无未定时间待办。</li>}</ul></div><button type="button" className="compact-full-link" onClick={() => void setMode('full')}>打开完整工作台</button></section>;
}

/** 工作站单条引用任务，HTML5 拖动只改变 membership 排列，不修改 Task。 */
function WorkstationRow({ task, index, projects, onRemove, onReorder }: { task: Task; index: number; projects: Project[]; onRemove: (id: string) => void; onReorder: (sourceId: string, targetId: string) => void; }) {
  const project = findProject(task, projects);
  return <li className="workstation-row" draggable onDragStart={(event) => event.dataTransfer.setData('text/workstation-task-id', task.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData('text/workstation-task-id'); if (source) onReorder(source, task.id); }}><span className="workstation-order">{index + 1}</span><div><ProjectTag name={project.name} color={project.color} /><strong>{task.title}</strong></div><GripVertical className="workstation-grip" size={15} aria-hidden="true" /><button type="button" className="workstation-remove" aria-label={`从工作站移除${task.title}`} title="仅从工作站移除" onClick={() => onRemove(task.id)}><X size={15} /></button></li>;
}

/** 通过有序 task ID 实时解析任务，支持移除、清空和引用独立的拖动排序。 */
export function WorkstationPanel({ tasks, projects, workstationTaskIds, onToggleWorkstation, onClearWorkstation, onReorderWorkstation }: Pick<CompactWorkspaceProps, 'projects' | 'workstationTaskIds' | 'onToggleWorkstation' | 'onClearWorkstation' | 'onReorderWorkstation'> & { tasks: Task[] }) {
  const { setMode } = useDesktopWindow(); const items = workstationTaskIds.map((id) => tasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task));
  return <section className="compact-workspace workstation-panel" data-testid="workstation-panel"><header><h2>工作站 <small>· {items.length}</small></h2><button type="button" onClick={onClearWorkstation} disabled={!items.length}>清空</button></header><ol>{items.length ? items.map((task, index) => <WorkstationRow key={task.id} task={task} index={index} projects={projects} onRemove={onToggleWorkstation} onReorder={onReorderWorkstation} />) : <li className="compact-empty">加入几件正在推进的任务，它们会一直留在这里。</li>}</ol><button type="button" className="compact-full-link" onClick={() => void setMode('full')}>打开完整工作台</button></section>;
}
