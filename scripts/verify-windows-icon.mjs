/**
 * @fileoverview 比较 Windows EXE 实际提取的应用图标与 electron-builder 的统一 ICO 源，防止只更新 Web 资源。
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/** 从 Windows Shell 提取 EXE 与 ICO 的关联图标，并逐像素比较同一系统选择的尺寸。 */
export function verifyWindowsExecutableIcon(executablePath, sourceIconPath) {
  if (process.platform !== 'win32')
    throw new Error('Windows executable icon verification only runs on Windows.');
  const source = resolve(sourceIconPath);
  const executable = resolve(executablePath);
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    '$sourceIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:THREADLINE_ICON_SOURCE)',
    '$executableIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:THREADLINE_ICON_EXECUTABLE)',
    'if ($null -eq $sourceIcon -or $null -eq $executableIcon) { throw "Missing associated Windows icon." }',
    '$sourceBitmap = $sourceIcon.ToBitmap()',
    '$executableBitmap = $executableIcon.ToBitmap()',
    'try {',
    '  if ($sourceBitmap.Width -ne $executableBitmap.Width -or $sourceBitmap.Height -ne $executableBitmap.Height) { throw "Windows icon dimensions differ." }',
    '  for ($y = 0; $y -lt $sourceBitmap.Height; $y++) {',
    '    for ($x = 0; $x -lt $sourceBitmap.Width; $x++) {',
    '      if ($sourceBitmap.GetPixel($x, $y).ToArgb() -ne $executableBitmap.GetPixel($x, $y).ToArgb()) { throw "Windows icon pixels differ at $x,$y." }',
    '    }',
    '  }',
    '  Write-Output "Windows executable icon matches ICO source."',
    '} finally {',
    '  $sourceBitmap.Dispose()',
    '  $executableBitmap.Dispose()',
    '  $sourceIcon.Dispose()',
    '  $executableIcon.Dispose()',
    '}',
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      THREADLINE_ICON_EXECUTABLE: executable,
      THREADLINE_ICON_SOURCE: source,
    },
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `Windows executable icon verification failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}
