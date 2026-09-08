/**
 * @fileoverview 共享 Web 与 Electron 根文档结构和元数据，不引入任何请求期 API。
 */

import type { Metadata } from 'next';
import { appearanceBootstrap } from '@/features/appearance/appearance-preferences';
import { AppearanceRuntime } from '@/features/appearance/appearance-runtime';

export const threadlineMetadata: Metadata = {
  title: 'Threadline · 我的工作台',
  description: '高信息密度个人时间规划与复盘工作台',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.png',
    apple: '/apple-touch-icon.png',
  },
};

/** 渲染两条 Next 构建链共用的根 HTML；调用方决定动态或静态渲染。 */
export function ThreadlineDocument({
  children,
  nonce,
}: Readonly<{ children: React.ReactNode; nonce?: string }>) {
  return (
    <html lang="zh-CN" data-theme="blue" data-font="default" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: appearanceBootstrap }}
        />
      </head>
      <body>
        <AppearanceRuntime />
        {children}
      </body>
    </html>
  );
}
