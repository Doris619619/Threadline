/** @fileoverview 编译实际 Main 模块，在隔离 VM 注入 Electron，验证 IPC 来源与无系统副作用。 */
import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createAutoStartController } from '@/lib/desktop-auto-start';

const handlers = new Map<string, (event: unknown, value?: unknown) => unknown>();
const write = vi.fn();
/** 编译真实源文件并只允许明确列出的依赖，测试中不加载 Electron 或写本机注册表。 */
function register() {
  const runtimeModule = {
    exports: {} as {
      registerAutoStart: (trusted: (event: unknown) => boolean) => void;
    },
  };
  const dependencies: Record<string, unknown> = {
    electron: {
      app: {
        isPackaged: false,
        getPath: () => 'test-user-data',
        getLoginItemSettings: () => ({ executableWillLaunchAtLogin: false }),
        setLoginItemSettings: write,
      },
      ipcMain: {
        handle: (
          channel: string,
          handler: (event: unknown, value?: unknown) => unknown,
        ) => handlers.set(channel, handler),
      },
    },
    'node:fs': {
      existsSync: () => false,
      readFileSync: () => '{}',
      writeFileSync: vi.fn(),
    },
    'node:path': path,
    '../src/lib/desktop-auto-start.js': { createAutoStartController },
  };
  const { outputText: code } = ts.transpileModule(
    readFileSync('electron/auto-start.cts', 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  );
  runInNewContext(code, {
    module: runtimeModule,
    exports: runtimeModule.exports,
    process: { platform: 'win32', execPath: 'test.exe', resourcesPath: 'resources' },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  runtimeModule.exports.registerAutoStart((event) => event === 'trusted');
}
beforeEach(() => {
  handlers.clear();
  write.mockClear();
  register();
});
it('rejects unknown windows for every auto-start operation', () => {
  for (const handler of handlers.values())
    expect(() => handler('edge-tab', true)).toThrow('Rejected');
});
it('returns unsupported for development and never writes login settings', () => {
  expect(handlers.get('desktop:auto-start-get')!('trusted')).toEqual({
    supported: false,
    enabled: false,
    decided: true,
  });
  expect(() => handlers.get('desktop:auto-start-set')!('trusted', true)).toThrow();
  expect(() => handlers.get('desktop:auto-start-set')!('trusted', 'true')).toThrow();
  expect(write).not.toHaveBeenCalled();
});
