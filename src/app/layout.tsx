import type { Metadata } from 'next';
import './globals.css';
import { PwaRegistrar } from '@/components/pwa-registrar';

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
      <body>
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
