import { Plus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import { StatItem } from '@/components/ui/stat-item';
import { Surface } from '@/components/ui/surface';

const tasks = [
  ['08:30', '工作', '#4f8cff', '邮件处理', '40min', '—', false],
  ['10:45', '课程', '#8b7cf6', '统计课预习', '1h', '—', false],
  ['12:00–13:30', '课程', '#8b7cf6', '领域论文', '1h30min', '56min', true],
  ['14:20', 'AI研究', '#38a774', '跑 Demo', '45min', '—', false],
  ['15:10–16:10', '会议', '#e58063', '会议记录', '1h', '58min', true],
  ['17:00', '生活', '#e9a04b', '健身', '1h', '—', false],
] as const;

export function StaticDashboard() {
  return (
    <div className="dashboard">
      <Surface className="metric-strip">
        <StatItem
          label="普通任务"
          value={
            <>
              <em>6</em>
              <small>/ 12</small>
            </>
          }
        />
        <StatItem
          label="Daily"
          value={
            <>
              <em>2</em>
              <small>/ 4</small>
            </>
          }
        />
        <StatItem
          label="普通实际"
          value={
            <>
              <em>5h20</em>
              <small>min</small>
            </>
          }
        />
        <StatItem
          label="Daily 实际"
          value={
            <>
              <em>1h10</em>
              <small>min</small>
            </>
          }
        />
        <StatItem
          label="今日总实际"
          value={
            <>
              <em>6h30</em>
              <small>min</small>
            </>
          }
        />
      </Surface>
      <Surface className="quick-panel">
        <header>
          <h2>无时间待办</h2>
          <button className="add-link">
            <Plus size={19} /> 添加
          </button>
        </header>
        <div className="quick-tasks">
          <label>
            <Checkbox aria-label="完成买转换插头" />
            <ProjectTag name="其他" color="#8793a7" />
            <b>买转换插头</b>
          </label>
          <label>
            <Checkbox aria-label="完成取快递" />
            <ProjectTag name="生活" color="#e9a04b" />
            <b>取快递</b>
          </label>
        </div>
      </Surface>
      <div className="dashboard-columns">
        <Surface className="schedule-panel">
          <header>
            <h2>今日日程</h2>
          </header>
          <div className="timeline-head">
            <span>时间</span>
            <span>项目</span>
            <span>任务</span>
            <span>预计 / 实际</span>
          </div>
          {tasks.map(([time, project, color, title, planned, actual, complete]) => (
            <div className={`timeline-row${complete ? 'completed' : ''}`} key={title}>
              <time>{time}</time>
              <Checkbox aria-label={`完成${title}`} defaultChecked={complete} />
              <ProjectTag name={project} color={color} />
              <b>{title}</b>
              <span className="duration">
                <small>预计</small>
                {planned}
                <small>实际</small>
                {actual}
              </span>
            </div>
          ))}
        </Surface>
        <Surface className="daily-panel">
          <header>
            <h2>Daily 任务</h2>
          </header>
          <DailyGroup
            project="健身"
            color="#e9a04b"
            title="听力训练"
            checked
            childItems={[
              ['精听', '20min', true],
              ['跟读', '10min', true],
              ['复盘错题', '0min', false],
            ]}
          />
          <DailyGroup
            project="六级"
            color="#8b7cf6"
            title="背单词"
            childItems={[
              ['新词', '0min', false],
              ['复习', '0min', false],
            ]}
          />
          <DailyGroup project="GitHub" color="#4f8cff" title="发布周报" />
          <button className="daily-add">
            <Plus size={19} /> 添加 Daily
          </button>
        </Surface>
      </div>
    </div>
  );
}

function DailyGroup({
  project,
  color,
  title,
  checked,
  childItems,
}: {
  project: string;
  color: string;
  title: string;
  checked?: boolean;
  childItems?: readonly (readonly [string, string, boolean])[];
}) {
  return (
    <section className="daily-group">
      <div className="daily-parent">
        <Checkbox aria-label={`完成 Daily ${title}`} defaultChecked={checked} />
        <ProjectTag name={project} color={color} />
        <b>{title}</b>
        <small>Daily</small>
      </div>
      {childItems && (
        <div className="daily-children">
          {childItems.map(([label, actual, isDone]) => (
            <label key={label}>
              <Checkbox aria-label={`完成 ${label}`} defaultChecked={isDone} />
              <span>{label}</span>
              <small>实际 {actual}</small>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
