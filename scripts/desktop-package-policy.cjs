/** @fileoverview 统一桌面外部运行依赖和语言范围，按已安装依赖图生成 builder 排除规则。 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, join, resolve } = require('node:path');

const runtimeDependencies = ['electron-updater'];
const electronLanguages = ['zh-CN', 'zh-TW', 'en-US', 'en-GB'];

/** 从依赖自身解析 package metadata；兼容通过 exports 隐藏 package.json 的模块。 */
function resolveManifest(name, parentManifest) {
  const requireFromParent = createRequire(parentManifest);
  try {
    return requireFromParent.resolve(`${name}/package.json`);
  } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
    let directory = dirname(requireFromParent.resolve(name));
    while (dirname(directory) !== directory) {
      const candidate = join(directory, 'package.json');
      try {
        if (JSON.parse(readFileSync(candidate, 'utf8')).name === name) return candidate;
      } catch (readError) {
        if (readError.code !== 'ENOENT') throw readError;
      }
      directory = dirname(directory);
    }
    throw new Error(`Cannot locate desktop runtime package: ${name}`);
  }
}

/** 遍历实际安装的必需、可选和 peer 依赖；缺少必需依赖时立即失败，Electron 由 runtime 提供。 */
function collectRuntimeDependencies(projectDirectory, roots = runtimeDependencies) {
  const names = new Set();
  const visited = new Set();
  /** 按父包位置解析每个版本；已访问 manifest 终止环，未安装的可选依赖允许跳过。 */
  function visit(name, parentManifest, optional = false) {
    if (name === 'electron') return;
    let manifest;
    try {
      manifest = resolveManifest(name, parentManifest);
    } catch (error) {
      if (optional && error.code === 'MODULE_NOT_FOUND') return;
      throw error;
    }
    if (visited.has(manifest)) return;
    visited.add(manifest);
    names.add(name);
    const metadata = JSON.parse(readFileSync(manifest, 'utf8'));
    const dependencies = {
      ...metadata.peerDependencies,
      ...metadata.dependencies,
      ...metadata.optionalDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      visit(
        dependency,
        manifest,
        Object.hasOwn(metadata.optionalDependencies ?? {}, dependency) ||
          metadata.peerDependenciesMeta?.[dependency]?.optional === true,
      );
    }
  }
  for (const name of roots) visit(name, resolve(projectDirectory, 'package.json'));
  return [...names].sort();
}

/** builder 自动追加生产依赖，因此以排除规则限制顶层模块；保留其嵌套版本与 scoped 依赖。 */
function dependencyExclusions(names) {
  if (!names.length) return ['!node_modules/**/*'];
  const topLevel = [...new Set(names.map((name) => name.split('/')[0]))];
  const patterns = [`!node_modules/!(${topLevel.join('|')}){,/**/*}`];
  for (const scope of topLevel.filter((name) => name.startsWith('@'))) {
    const packages = names
      .filter((name) => name.startsWith(`${scope}/`))
      .map((name) => name.split('/')[1]);
    patterns.push(`!node_modules/${scope}/!(${packages.join('|')}){,/**/*}`);
  }
  return patterns;
}

module.exports = {
  runtimeDependencies,
  electronLanguages,
  collectRuntimeDependencies,
  dependencyExclusions,
};
