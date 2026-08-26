/** @fileoverview 配置 Next 源码 lint，并忽略所有可再生的桌面与 Web 构建输出。 */

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    '.next/**',
    '.next-tauri/**',
    '.next-electron/**',
    'dist-electron/**',
    'node_modules/**',
    'src-tauri/target/**',
    'coverage/**',
    'playwright-report/**',
  ]),
]);
