/**
 * @fileoverview 定义 Threadline 根文档；业务与 PWA 运行时由 role 分流后的 Main 组件挂载。
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Threadline · 我的工作台',
  description: '高信息密度个人时间规划与复盘工作台',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
