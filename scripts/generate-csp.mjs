/**
 * @fileoverview 从生产 HTML 提取精确内联 script hash，并拒绝未审计的内联样式和外部 origin。
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

const outputDirectory = process.argv[2] ?? '.next';
const manifestPath = join(outputDirectory, 'threadline-csp.json');

/** 递归返回构建目录中的静态 HTML，兼容 App Router 的嵌套路由输出。 */
async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectHtmlFiles(path);
      return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
    }),
  );
  return files.flat();
}

/** 将构建文件相对路径换算为请求路径。 */
function routeFromFile(root, file) {
  const value = relative(root, file).split(sep).join('/');
  if (value === 'index.html') return '/';
  return (
    `/${value.replace(/index\.html$/, '').replace(/\.html$/, '')}`.replace(/\/$/, '') ||
    '/'
  );
}

/** 生成内容精确的 CSP 指令，禁止以 unsafe-inline 作为 hash 漂移回退。 */
function createPolicy(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** 检查一个 HTML 页面并返回所有实际内联 script 的 SHA-256 source。 */
function inspectHtml(html, file) {
  if (/<style\b/i.test(html) || /\sstyle\s*=/i.test(html)) {
    throw new Error(`CSP build rejected inline style in ${file}`);
  }
  const externalOrigin = /\b(?:src|href)\s*=\s*["']https?:\/\//i;
  if (externalOrigin.test(html)) {
    throw new Error(`CSP build rejected external origin in ${file}`);
  }
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attributes, content] = match;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(content).digest('base64')}'`);
  }
  return [...new Set(hashes)].sort();
}

const applicationHtmlRoot = existsSync(join(outputDirectory, 'server', 'app'))
  ? join(outputDirectory, 'server', 'app')
  : outputDirectory;
const files = (await collectHtmlFiles(applicationHtmlRoot)).filter(
  // Next 内部 500 fallback 不属于可路由应用页面；其内建 style 不应扩大业务 CSP。
  (file) => !basename(file).startsWith('_') && basename(file) !== '404.html',
);
if (files.length === 0)
  throw new Error(`CSP build found no HTML under ${outputDirectory}`);
const routes = {};
for (const file of files) {
  const html = await readFile(file, 'utf8');
  const hashes = inspectHtml(html, file);
  routes[routeFromFile(applicationHtmlRoot, file)] = {
    scriptHashes: hashes,
    header: createPolicy(hashes),
  };
}
await writeFile(
  manifestPath,
  `${JSON.stringify({ version: 1, routes }, null, 2)}\n`,
  'utf8',
);
console.log(
  `Generated CSP manifest for ${Object.keys(routes).length} route(s): ${manifestPath}`,
);
