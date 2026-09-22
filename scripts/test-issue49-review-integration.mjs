/** @fileoverview 以真实仓储和本地 PostgREST 验证微秒恢复及超过 max_rows 的工作站命令。 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 临时编译真实 TypeScript 仓储，保持其映射、参数构造和分页路径完全一致。 */
export async function loadReviewRepository() {
  const output = await build({
    entryPoints: ['src/lib/supabase/workspace-repository.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const directory = resolve('.tmp');
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `issue49-review-repository-${process.pid}.cjs`);
  await writeFile(file, output.outputFiles[0].text);
  try {
    return (await import(pathToFileURL(file).href)).SupabaseWorkspaceRepository;
  } finally {
    await unlink(file);
  }
}

/** 由本地 runner 传入一次性账号，生产地址和凭据不进入此用例。 */
export async function testIssue49Review(owner, project) {
  const Repository = await loadReviewRepository();
  const repository = new Repository(owner);
  const id = crypto.randomUUID();
  const deletedAt = '2026-09-22T04:00:00.123456+00:00';
  const inserted = await owner
    .from('tasks')
    .insert({
      id,
      project_id: project,
      title: 'microsecond restore',
      status: 'trashed',
      deleted_at: deletedAt,
    });
  if (inserted.error) throw inserted.error;
  const mapped = (await repository.listTasks()).find((task) => task.id === id);
  assert.ok(mapped.deletedAt.includes('.123456'));
  const restored = await repository.restoreTask(id, '2099-01-01', mapped);
  assert.equal(restored.status, 'active');
  // 真实精度只差一微秒仍应拒绝，不能以毫秒比较代替并发保护。
  const changed = await owner
    .from('tasks')
    .update({ status: 'trashed', deleted_at: '2026-09-22T04:00:00.123457+00:00' })
    .eq('id', id);
  if (changed.error) throw changed.error;
  await assert.rejects(
    repository.restoreTask(id, '2099-01-01', mapped),
    /其他设备修改/,
  );

  const ids = Array.from({ length: 1001 }, () => crypto.randomUUID());
  for (let offset = 0; offset < ids.length; offset += 500) {
    const response = await owner
      .from('tasks')
      .insert(
        ids
          .slice(offset, offset + 500)
          .map((taskId) => ({
            id: taskId,
            project_id: project,
            title: 'large workstation',
            status: 'waiting',
          })),
      );
    if (response.error) throw response.error;
  }
  // 先准备 1000 条，最后一条必须通过正式写命令加入；不重复执行写 RPC 来翻页。
  for (let offset = 0; offset < 1000; offset += 500) {
    const response = await owner
      .from('workstation_entries')
      .insert(
        ids
          .slice(offset, offset + 500)
          .map((taskId, index) => ({
            task_id: taskId,
            position: 1000000 + offset + index,
          })),
      );
    if (response.error) throw response.error;
  }
  const added = await repository.applyWorkstationCommand({
    type: 'add',
    id: ids[1000],
  });
  assert.equal(new Set(added).size, added.length);
  for (const taskId of ids)
    assert.ok(added.includes(taskId), `missing added member ${taskId}`);
  const moved = await repository.applyWorkstationCommand({
    type: 'move',
    id: ids[1000],
    anchor: ids[0],
    after: false,
  });
  assert.equal(new Set(moved).size, moved.length);
  for (const taskId of ids)
    assert.ok(moved.includes(taskId), `missing moved member ${taskId}`);
  assert.equal(moved.indexOf(ids[1000]), moved.indexOf(ids[0]) - 1);
  // 证明本轮真实 API 确实保持 max_rows=1000，避免测试在宽松配置下虚假通过。
  const capped = await owner
    .from('workstation_entries')
    .select('task_id')
    .is('removed_at', null);
  if (capped.error) throw capped.error;
  assert.equal(capped.data.length, 1000);
  console.log(
    'Issue 49 review: exact microsecond restore/conflict and 1001-member add/move passed.',
  );
}
