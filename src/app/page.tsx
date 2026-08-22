import { AppShell } from '@/components/app-shell';
import { StaticDashboard } from '@/features/dashboard/static-dashboard';

export default function Home() {
  return (
    <AppShell>
      <StaticDashboard />
    </AppShell>
  );
}
