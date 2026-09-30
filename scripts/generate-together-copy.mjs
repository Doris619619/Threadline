/** @fileoverview 从两人空间话术与 JSX 提取文案表；--check 保证 Markdown 与实际页面同步。 */
import ts from 'typescript';
import { format, resolveConfig } from 'prettier';
import { fileURLToPath } from 'node:url';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const base = new URL('../src/features/together/', import.meta.url);
const source = await readFile(new URL('copy.ts', base), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { togetherCopy } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const labels = {
  title: '空间名称',
  intro: '页头说明',
  empty: '空间空状态',
  placeholder: '创建目标提示',
  cheer: '鼓励按钮',
  cheered: '收到鼓励',
  submit: '成果入口',
  waiting: '等待验收',
  approve: '通过按钮',
  approved: '通过后的提示',
  changes: '补充提示',
  surprise: '收到惊喜',
  overdue: '逾期',
};
/** Markdown 表格转义保证文案中的管道符与换行保持可读。 */
function cell(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
const rows = Object.keys(labels).map(
  (key) =>
    `| ${labels[key]} | ${cell(togetherCopy.friends[key])} | ${cell(togetherCopy.couple[key])} |`,
);
const literals = new Map();
for (const file of (await readdir(base))
  .filter((name) => /\.tsx?$/.test(name) && name !== 'preview.tsx')
  .sort()) {
  const content = await readFile(new URL(file, base), 'utf8');
  const tree = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** 收集页面字面量与动态模板；用户自行填写的内容不属于固定文案。 */
  function visit(node) {
    let value;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node)
    )
      value = node.text;
    if (ts.isTemplateExpression(node)) value = node.getText(tree).slice(1, -1);
    value = value?.replace(/\s+/g, ' ').trim();
    if (value && /[\u3400-\u9fff]/.test(value)) {
      const set = literals.get(value) ?? new Set();
      set.add(file);
      literals.set(value, set);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
// 状态与操作历史中由数据库生成的固定文案也属于页面话术。
const migration = 'supabase/migrations/202609280001_together.sql';
const sql = await readFile(new URL(`../${migration}`, import.meta.url), 'utf8');
for (const match of sql.matchAll(/'([^'\r\n]*[\u3400-\u9fff][^'\r\n]*)'/g)) {
  const files = literals.get(match[1]) ?? new Set();
  files.add(migration);
  literals.set(match[1], files);
}
const shared = [...literals]
  .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  .map(([value, files]) => `| ${cell(value)} | ${[...files].join('、')} |`);
const output = `<!-- 文件用途：完整记录两人空间好友版、情侣版及共用提示，供产品审阅；由代码生成并通过 --check 校验。 -->

# 两人空间文案表

情侣专属文案采用用户 2026-09-28 提供的版本。TA 会在页面中替换为空间昵称或展示名，不按性别推测称呼。好友版与情侣版共用微信成果验收流程。

## 关系专属话术

| 场景 | 好朋友 | 情侣 |
| --- | --- | --- |
${rows.join('\n')}

## 微信成果与时区约定

- 图片通过微信发送，应用不上传、读取或验证微信内容；“已通过微信发送成果”是执行人的主动声明。
- 点击确认后进入待验收，由对方明确通过后完成；应用不把微信发送等同于已完成。
- 每个人看到自己的账号时区。顶部显示当前日期、时钟及地区，详情显示查看时区与创建时区。
- 自己的奖励是自由文本；额外惊喜保留文字记录，照片仍走微信。
- 甜蜜互动只发生在 flag 上，不复制 Parallel 的独立抱抱/想你功能。

## 共用文案、按钮、状态与错误提示

以下包括页面里的固定文案片段与动态模板；模板中的变量在运行时替换为姓名、时间或计数。完整句子的来源可按文件定位。

| 文案 / 模板 | 来源 |
| --- | --- |
${shared.join('\n')}

## 维护

先修改 src/features/together 中的文案，再运行 \`node scripts/generate-together-copy.mjs\`。提交前运行 \`node scripts/generate-together-copy.mjs --check\`，避免文档与页面不一致。
`;
const path = new URL('../docs/together-copy.md', import.meta.url);
const formatted = await format(output, {
  ...(await resolveConfig(fileURLToPath(path))),
  parser: 'markdown',
});
if (process.argv.includes('--check')) {
  if (
    (await readFile(path, 'utf8')).replaceAll('\r\n', '\n') !==
    formatted.replaceAll('\r\n', '\n')
  )
    throw new Error('两人空间文案表与代码不同，请重新生成。');
  console.log('Together copy inventory matches source.');
} else {
  await writeFile(path, formatted);
  console.log('Generated docs/together-copy.md');
}
