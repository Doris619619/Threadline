'use client';
import { ArchiveRestore, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';
import type { Project } from '@/types/domain';

const initial: Project[] = [
  {
    id: 'work',
    name: '工作',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-08-23',
  },
  {
    id: 'course',
    name: '课程',
    color: '#8b7cf6',
    status: 'active',
    createdAt: '2026-08-23',
  },
  {
    id: 'research',
    name: 'AI研究',
    color: '#38a774',
    status: 'active',
    createdAt: '2026-08-23',
  },
  {
    id: 'life',
    name: '生活',
    color: '#e9a04b',
    status: 'active',
    createdAt: '2026-08-23',
  },
  {
    id: 'other',
    name: '其他',
    color: '#8793a7',
    status: 'active',
    createdAt: '2026-08-23',
  },
];
export function ProjectPanel() {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f8cff');
  const add = () => {
    if (!name.trim()) return;
    setItems((current) => [
      ...current,
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
        {items.map((project) => (
          <div className="project-row" key={project.id}>
            <ProjectTag name={project.name} color={project.color} />
            <b>{project.status === 'archived' ? '已归档' : '活跃'}</b>
            <span>累计 0min · 普通任务 0/0 · Daily 0/0</span>
            {project.id === 'other' ? (
              <small>内置项目</small>
            ) : (
              <Button
                size="compact"
                variant="quiet"
                onClick={() =>
                  setItems((current) =>
                    current.map((item) =>
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
        ))}
      </div>
    </Surface>
  );
}
