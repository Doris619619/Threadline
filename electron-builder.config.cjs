/** 文件用途：定义 Threadline Electron Windows x64 unpacked 与 NSIS 打包基础配置。 */

const iconTheme = process.env.THREADLINE_DESKTOP_THEME === 'anya' ? 'anya' : 'blue';

module.exports = {
  extraMetadata: { threadlineIconTheme: iconTheme },
  appId: 'com.doris619619.threadline',
  productName: 'Threadline',
  publish: {
    provider: 'github',
    owner: 'Doris619619',
    repo: 'Threadline',
    releaseType: 'draft',
  },
  directories: {
    output: 'release',
  },
  files: [
    'dist-electron/**/*',
    '.next-electron/**/*',
    'electron/assets/**/*',
    'package.json',
    '!.pnpm-store/**/*',
  ],
  asar: true,
  afterPack: './scripts/after-pack.cjs',
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon:
      iconTheme === 'anya'
        ? 'electron/assets/icon-anya.ico'
        : 'electron/assets/icon.ico',
  },
  nsis: {
    include: 'scripts/installer.nsh',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Threadline',
  },
  artifactName: 'Threadline_${version}_${arch}-setup.${ext}',
};
