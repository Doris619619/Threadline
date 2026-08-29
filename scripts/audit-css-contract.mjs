/**
 * @fileoverview 将 globals.css 展开成有序 PostCSS 规则合同，供机械拆分前后比较。
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';

const root = process.cwd();
const input = process.argv[2] ?? 'src/app/globals.css';
const output = process.argv[3] ?? '.tmp-css-contract.json';
const normalize = (value) => value.replace(/\s+/g, ' ').trim();

/** 递归展开本地 CSS import，Tailwind 保留为稳定的入口标记。 */
async function expand(filePath, inheritedContext = []) {
  const css = await readFile(filePath, 'utf8');
  const ast = postcss.parse(css, { from: filePath });
  const records = [];
  for (const node of ast.nodes ?? []) {
    if (node.type === 'atrule' && node.name === 'import') {
      const match = node.params.match(/['"]([^'"]+)['"]/);
      if (!match) continue;
      if (!match[1].startsWith('.')) {
        records.push({ context: inheritedContext, kind: 'import', value: match[1] });
        continue;
      }
      const resolved = path.resolve(path.dirname(filePath), match[1]);
      records.push(...(await expand(resolved, inheritedContext)));
      continue;
    }
    collectRule(node, inheritedContext, records);
  }
  return records;
}

/** 将 selector、声明和包含它的媒体上下文序列化，不保留文件路径与注释。 */
function collectRule(node, context, records) {
  if (node.type === 'rule') {
    records.push({
      context,
      kind: 'rule',
      selector: normalize(node.selector),
      declarations: (node.nodes ?? [])
        .filter((child) => child.type === 'decl')
        .map((child) => [
          child.prop,
          normalize(child.value),
          Boolean(child.important),
        ]),
    });
    return;
  }
  if (node.type !== 'atrule' || !node.nodes) return;
  const nextContext = [...context, normalize(`@${node.name} ${node.params}`)];
  for (const child of node.nodes) collectRule(child, nextContext, records);
}

const records = await expand(path.resolve(root, input));
await writeFile(path.resolve(root, output), `${JSON.stringify(records, null, 2)}\n`);
console.log(`Wrote ${records.length} ordered CSS records to ${output}`);
