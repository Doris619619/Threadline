/** @fileoverview 定义 Threadline Vitest 运行环境与可逐步提高的 V8 覆盖率门槛。 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // 只把会改变业务数据或云端边界的模块纳入 gate；页面展示组件由 Playwright 覆盖。
      // 显式 include 也会把尚未被任何单测导入的高风险模块按 0% 计入总分。
      include: [
        'src/features/daily/daily-rules.ts',
        'src/features/tasks/hooks/use-close-day.ts',
        'src/features/tasks/hooks/use-task-workflow.ts',
        'src/features/tasks/hooks/use-task-create-and-edit.ts',
        'src/features/tasks/hooks/use-task-dashboard-data.ts',
        'src/features/tasks/task-time.ts',
        'src/lib/analytics.ts',
        'src/lib/task-rules.ts',
        'src/lib/task-factory.ts',
        'src/lib/project-rules.ts',
        'src/lib/local-date.ts',
        'src/lib/date-range.ts',
        'src/lib/repository.ts',
        'src/lib/supabase/config.ts',
        'src/lib/supabase/time-mapper.ts',
        'src/lib/supabase/workspace-repository.ts',
      ],
      thresholds: {
        // 门槛以显式纳入的未导入业务模块为基线，并保留小幅增长空间。
        statements: 50,
        branches: 50,
        functions: 40,
        lines: 55,
      },
    },
  },
  resolve: { alias: { '@': `${import.meta.dirname}/src` } },
});
