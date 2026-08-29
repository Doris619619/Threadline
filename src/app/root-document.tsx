/**
 * @fileoverview 共享 Web 与 Electron 根文档结构和元数据，不引入任何请求期 API。
 */

import type { Metadata } from 'next';

export const threadlineMetadata: Metadata = {
  title: 'Threadline · 我的工作台',
  description: '高信息密度个人时间规划与复盘工作台',
  manifest: '/manifest.webmanifest',
};

/** 渲染两条 Next 构建链共用的根 HTML；调用方决定动态或静态渲染。 */
export function ThreadlineDocument({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
