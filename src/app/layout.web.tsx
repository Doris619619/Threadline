/**
 * @fileoverview 定义 Web/PWA 请求期根布局，显式读取 nonce header 以禁止静态预渲染。
 */

import { headers } from 'next/headers';
import { ThreadlineDocument, threadlineMetadata } from '@/app/root-document';
import '@/app/global-styles';

export const metadata = threadlineMetadata;
export const dynamic = 'force-dynamic';

/** 读取 Web Proxy 注入的 nonce header，确保 Next 在请求期渲染并为脚本附加 nonce。 */
export default async function WebRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await headers();
  return <ThreadlineDocument>{children}</ThreadlineDocument>;
}
