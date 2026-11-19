/** @fileoverview 约束全项目非环形焦点与 hover 输入边界，允许强制色模式使用必要系统轮廓。 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import postcss, { type Container } from 'postcss';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');

/** 递归纳入所有功能与主题 CSS，防止后续局部样式悄悄恢复传统焦点环。 */
async function cssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? cssFiles(path) : path.endsWith('.css') ? [path] : [];
    }),
  );
  return groups.flat();
}

/** 强制色系统会移除背景与阴影，只有该环境允许使用必要的系统轮廓作为焦点标识。 */
function isForcedColors(container: Container): boolean {
  let current: Container | undefined = container;
  while (current) {
    if (
      current.type === 'atrule' &&
      'params' in current &&
      String(current.params).includes('forced-colors: active')
    )
      return true;
    current = current.parent;
  }
  return false;
}

test('normal focus feedback has no enclosing outline or outer spread shadow in any module', async () => {
  const violations: string[] = [];
  for (const file of await cssFiles(resolve(root, 'src'))) {
    const stylesheet = postcss.parse(await readFile(file, 'utf8'), { from: file });
    stylesheet.walkRules((rule) => {
      if (!rule.selector.includes(':focus') || isForcedColors(rule)) return;
      rule.walkDecls((declaration) => {
        const outerOutline =
          declaration.prop === 'outline' && !/^(none|0)(\s|$)/.test(declaration.value);
        const outerShadow =
          declaration.prop === 'box-shadow' &&
          /(^|,)\s*0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+[1-9]/.test(declaration.value);
        if (outerOutline || outerShadow)
          violations.push(
            relative(root, file) +
              ':' +
              declaration.source?.start?.line +
              ' ' +
              declaration.toString(),
          );
      });
    });
  }
  expect(violations).toEqual([]);
});

test('hover feedback is limited to hover-capable inputs instead of sticking after touch release', async () => {
  const violations: string[] = [];
  for (const file of await cssFiles(resolve(root, 'src'))) {
    const stylesheet = postcss.parse(await readFile(file, 'utf8'), { from: file });
    stylesheet.walkRules((rule) => {
      if (!rule.selector.includes(':hover')) return;
      let current: Container | undefined = rule.parent;
      let guarded = false;
      while (current) {
        if (
          current.type === 'atrule' &&
          'params' in current &&
          /\(\s*hover\s*:\s*hover\s*\)/.test(String(current.params))
        )
          guarded = true;
        current = current.parent;
      }
      if (!guarded)
        violations.push(relative(root, file) + ':' + rule.source?.start?.line);
    });
  }
  expect(violations).toEqual([]);
});
