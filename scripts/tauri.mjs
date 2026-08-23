import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const [command] = process.argv.slice(2);

if (!['dev', 'build'].includes(command)) {
  throw new Error('Usage: pnpm tauri <dev|build>');
}

if (process.platform !== 'win32') {
  throw new Error('Threadline desktop packaging currently supports Windows only.');
}

const vswhere = join(
  process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  'Microsoft Visual Studio',
  'Installer',
  'vswhere.exe',
);
const visualStudioPath = execFileSync(
  vswhere,
  [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property',
    'installationPath',
  ],
  { encoding: 'utf8' },
).trim();
const vcvars = join(visualStudioPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
const msvcRoot = join(visualStudioPath, 'VC', 'Tools', 'MSVC');
const msvcVersion = existsSync(msvcRoot)
  ? readdirSync(msvcRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .at(-1)
  : undefined;
const msvcBin = msvcVersion
  ? join(msvcRoot, msvcVersion, 'bin', 'Hostx64', 'x64')
  : '';
const cargoBin = join(process.env.USERPROFILE ?? '', '.cargo', 'bin');
const tauriCli = join(process.cwd(), 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

if (!visualStudioPath || !existsSync(vcvars) || !existsSync(msvcBin)) {
  throw new Error('Visual Studio C++ Build Tools with the x64 MSVC toolset are required.');
}

const commandLine = [
  `call ${vcvars}`,
  `set "PATH=${msvcBin}${delimiter}${cargoBin}${delimiter}%PATH%"`,
  `${process.execPath} ${tauriCli} ${command}`,
].join(' && ');

const child = spawn('cmd.exe', ['/d', '/c', commandLine], {
  stdio: 'inherit',
  windowsVerbatimArguments: true,
});

child.once('exit', (code) => process.exit(code ?? 1));
