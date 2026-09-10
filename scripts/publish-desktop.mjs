/** @fileoverview 仅在 GitHub Actions 将验证后的安装包上传为草稿，核验远端资产后发布。 */
import { execFileSync } from 'node:child_process';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repository = 'Doris619619/Threadline';
/** 调用已安装 GitHub CLI；参数不经过 shell，token 只通过进程环境传入。 */
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', windowsHide: true });
}

/** 发布前校验版本、CI 来源与构建时的生产环境声明。 */
export async function validateRelease() {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'Doris619619/Threadline' ||
    process.env.GITHUB_REF !== `refs/tags/v${version}` ||
    !/^\d+\.\d+\.\d+$/.test(version)
  )
    throw new Error(
      'Release requires the matching stable version tag in Threadline Actions.',
    );
  if (!process.env.GH_TOKEN)
    throw new Error('GitHub Actions GITHUB_TOKEN with contents:write is required.');
  if (
    process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER === 'true' ||
    process.env.NEXT_PUBLIC_THREADLINE_CLOUD_ENV !== 'production'
  )
    throw new Error('Release requires production cloud configuration.');
  return version;
}

/** 上传全量资产后重新下载校验，最后才公开；中途失败保留草稿供检查。 */
async function publish() {
  const version = await validateRelease();
  const tag = `v${version}`;
  const files = [
    `Threadline_${version}_x64-setup.exe`,
    `Threadline_${version}_x64-setup.exe.blockmap`,
    'latest.yml',
  ];
  const metadata = await readFile('release/latest.yml', 'utf8');
  if (!metadata.includes(`version: ${version}`) || !metadata.includes(files[0]))
    throw new Error('Release metadata does not match installer.');
  const manifest = JSON.parse(
    await readFile('release/build-manifests/release.json', 'utf8'),
  );
  if (manifest.workingTree !== 'clean' || manifest.commit !== process.env.GITHUB_SHA) {
    throw new Error('Release must use the clean tagged commit.');
  }
  const installer = manifest.artifacts.find((a) => a.kind === 'nsis-installer');
  const bytes = await readFile(`release/${files[0]}`);
  if (
    !metadata.includes(`sha512: ${createHash('sha512').update(bytes).digest('base64')}`)
  ) {
    throw new Error('Update metadata checksum does not match installer.');
  }
  if (
    !installer ||
    createHash('sha256').update(bytes).digest('hex') !== installer.sha256
  )
    throw new Error('Installer differs from verified build.');
  for (const file of files)
    if (!(await stat(`release/${file}`)).size) throw new Error(`Empty asset: ${file}`);
  let existing;
  try {
    existing = JSON.parse(
      gh(['release', 'view', tag, '--repo', repository, '--json', 'isDraft']),
    );
  } catch {
    /* 创建调用会明确报告认证和网络失败。 */
  }
  if (existing && !existing.isDraft)
    throw new Error('Published releases are immutable; increment the version.');
  if (!existing)
    gh([
      'release',
      'create',
      tag,
      '--repo',
      repository,
      '--draft',
      '--title',
      `Threadline ${version}`,
      '--notes',
      'Windows x64 安装包。安装后可在设置 → 关于 Threadline 检查更新。',
    ]);
  gh([
    'release',
    'upload',
    tag,
    '--repo',
    repository,
    '--clobber',
    ...files.map((file) => `release/${file}`),
  ]);
  const temporary = await mkdtemp(join(tmpdir(), 'threadline-release-'));
  try {
    gh(['release', 'download', tag, '--repo', repository, '--dir', temporary]);
    for (const file of files) {
      const local = await readFile(`release/${file}`);
      const remote = await readFile(join(temporary, file));
      if (!local.equals(remote)) throw new Error(`Uploaded asset mismatch: ${file}`);
    }
    gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest']);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith('publish-desktop.mjs')) await publish();
