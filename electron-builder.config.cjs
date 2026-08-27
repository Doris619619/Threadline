/** 文件用途：定义 Threadline Electron Windows x64 unpacked 与 NSIS 打包基础配置。 */

module.exports = {
  appId: 'com.doris619619.threadline',
  productName: 'Threadline',
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
    icon: 'electron/assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Threadline',
  },
  artifactName: 'Threadline_${version}_${arch}-setup.${ext}',
};
