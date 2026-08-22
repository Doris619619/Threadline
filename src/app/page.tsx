import { AppShell } from '@/components/app-shell';
import { TaskDashboard } from '@/features/tasks/task-dashboard';

export default function Home() {
  return (
    <AppShell>
      <TaskDashboard />
    </AppShell>
  );
}
