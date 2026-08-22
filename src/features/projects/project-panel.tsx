'use client';
import { ArchiveRestore, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';
import type { Project, Task } from '@/types/domain';

export function ProjectPanel({
  items,
  tasks,
  onChange,
}: {
  items: Project[];
  tasks: Task[];
  onChange: (items: Project[]) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f8cff');
  const add = () => {
    if (!name.trim()) return;
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        color,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ]);
    setName('');
  };
  return (
    <Surface className="project-panel">
      <header>
        <div>
          <h2>项目</h2>
          <p>项目颜色、归档状态与累计投入会长期保留。</p>
        </div>
        <div className="project-create">
          <Input
            aria-label="新项目名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="新项目名称"
          />
          <input
            aria-label="项目颜色"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          <Button size="compact" onClick={add}>
            <Plus size={15} /> 添加
          </Button>
        </div>
      </header>
      <div className="project-list">
        {items.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const completed = projectTasks.filter((task) => task.completed).length;
          const actual = projectTasks.reduce(
            (total, task) => total + (task.actualDurationMinutes ?? 0),
            0,
          );
          return (
            <div className="project-row" key={project.id}>
              <ProjectTag name={project.name} color={project.color} />
              <b>{project.status === 'archived' ? '已归档' : '活跃'}</b>
              <span>
                累计 {actual}min · 普通任务 {completed}/{projectTasks.length}
              </span>
              {project.id === 'other' ? (
                <small>内置项目</small>
              ) : (
                <Button
                  size="compact"
                  variant="quiet"
                  onClick={() =>
                    onChange(
                      items.map((item) =>
                        item.id === project.id
                          ? {
                              ...item,
                              status: item.status === 'active' ? 'archived' : 'active',
                              archivedAt:
                                item.status === 'active'
                                  ? new Date().toISOString()
                                  : undefined,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <ArchiveRestore size={15} />
                  {project.status === 'active' ? '归档' : '恢复'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
