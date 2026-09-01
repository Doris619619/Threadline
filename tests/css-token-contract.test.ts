/**
 * @fileoverview 静态验证所有项目 CSS custom property 引用都有定义、fallback 或明确的运行时来源。
 */

import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, test } from 'vitest';

type CssVariableReference = {
  name: string;
  hasFallback: boolean;
  file: string;
  line: number;
};

const projectRoot = resolve(import.meta.dirname, '..');
const cssRoot = resolve(projectRoot, 'src');

/**
 * 由 React inline style 提供、因此不会出现在 CSS declaration 中的动态 custom property 白名单。
 */
const runtimeCustomProperties = new Set(['--annotation-color']);

/** 递归枚举 src 内的 CSS 源文件，确保主题、media 与 component scoped 定义都进入合同。 */
async function findCssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findCssFiles(path);
      return entry.isFile() && entry.name.endsWith('.css') ? [path] : [];
    }),
  );
  return nested.flat();
}

/** 判断字符是否能连接到 CSS 标识符，避免把 `myvar(...)` 中的片段误认作 var() 函数。 */
function isCssIdentifierCharacter(value: string | undefined) {
  return value !== undefined && /[A-Za-z0-9_-]/.test(value);
}

/** 跳过 CSS value 中的引号字符串，同时处理转义字符，防止内容文本里的 var(...) 造成误报。 */
function skipQuotedString(value: string, start: number) {
  const quote = value[start];
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1;
      continue;
    }
    if (value[index] === quote) return index + 1;
  }
  return value.length;
}

/** 跳过 CSS comment，使 comment 中的逗号或 var(...) 不影响 value 解析。 */
function skipComment(value: string, start: number) {
  const end = value.indexOf('*/', start + 2);
  return end === -1 ? value.length : end + 2;
}

/** 寻找函数开放括号的匹配闭合括号，并正确跳过嵌套函数、字符串和注释。 */
function findFunctionEnd(value: string, openParenthesis: number) {
  let depth = 1;
  for (let index = openParenthesis + 1; index < value.length; index += 1) {
    if (value[index] === '"' || value[index] === "'") {
      index = skipQuotedString(value, index) - 1;
      continue;
    }
    if (value.startsWith('/*', index)) {
      index = skipComment(value, index) - 1;
      continue;
    }
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

/** 从 var() 内容中分离变量名和顶层 fallback；嵌套函数内的逗号不算 fallback 分隔符。 */
function splitVariableAndFallback(value: string) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"' || value[index] === "'") {
      index = skipQuotedString(value, index) - 1;
      continue;
    }
    if (value.startsWith('/*', index)) {
      index = skipComment(value, index) - 1;
      continue;
    }
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      return {
        name: value.slice(0, index).trim(),
        hasFallback: value.slice(index + 1).trim() !== '',
      };
    }
  }
  return { name: value.trim(), hasFallback: false };
}

/**
 * 从一个 declaration value 中抽取全部真实 var() 调用，并继续解析 fallback 中嵌套的 var()。
 */
function collectVariableReferences(
  value: string,
): Array<{ name: string; hasFallback: boolean }> {
  const references: Array<{ name: string; hasFallback: boolean }> = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"' || value[index] === "'") {
      index = skipQuotedString(value, index) - 1;
      continue;
    }
    if (value.startsWith('/*', index)) {
      index = skipComment(value, index) - 1;
      continue;
    }
    const isVarFunction =
      value.slice(index, index + 3).toLowerCase() === 'var' &&
      value[index + 3] === '(' &&
      !isCssIdentifierCharacter(value[index - 1]);
    if (!isVarFunction) continue;

    const end = findFunctionEnd(value, index + 3);
    if (end === -1) throw new Error(`Unclosed var() function in CSS value: ${value}`);
    const contents = value.slice(index + 4, end);
    const reference = splitVariableAndFallback(contents);
    if (!/^--[A-Za-z0-9_-]+$/.test(reference.name)) {
      throw new Error(
        `Invalid CSS custom property in var(): ${reference.name || '<empty>'}`,
      );
    }
    references.push(reference);
    references.push(...collectVariableReferences(contents));
    index = end;
  }
  return references;
}

/** 使用 PostCSS 声明树收集定义与引用位置，而不是用全文件正则扫描。 */
async function inspectCssContract() {
  const definitions = new Set<string>();
  const references: CssVariableReference[] = [];
  for (const file of await findCssFiles(cssRoot)) {
    const source = await readFile(file, 'utf8');
    const stylesheet = postcss.parse(source, { from: file });
    stylesheet.walkDecls((declaration) => {
      const property = declaration.prop.trim();
      if (property.startsWith('--')) definitions.add(property);
      for (const reference of collectVariableReferences(declaration.value)) {
        references.push({
          ...reference,
          file: relative(projectRoot, file),
          line: declaration.source?.start?.line ?? 0,
        });
      }
    });
  }
  return { definitions, references };
}

describe('CSS custom property contract', () => {
  test('parses nested functions, explicit fallbacks, and quoted lookalikes without false positives', () => {
    expect(
      collectVariableReferences(
        'color-mix(in srgb, var(--accent, rgb(0, 1, 2)), var(--surface)); content: "var(--copy)"',
      ),
    ).toEqual([
      { name: '--accent', hasFallback: true },
      { name: '--surface', hasFallback: false },
    ]);
  });

  test('requires every non-fallback CSS custom property reference to be defined or runtime-allowlisted', async () => {
    const { definitions, references } = await inspectCssContract();
    const unresolved = references.filter(
      (reference) =>
        !reference.hasFallback &&
        !definitions.has(reference.name) &&
        !runtimeCustomProperties.has(reference.name),
    );

    expect(
      unresolved.map(
        (reference) => `${reference.file}:${reference.line} ${reference.name}`,
      ),
    ).toEqual([]);
  });
});
