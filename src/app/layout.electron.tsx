/**
 * @fileoverview 定义 Electron 静态导出的根文档，不读取请求期 headers。
 */

import { ThreadlineDocument, threadlineMetadata } from '@/app/root-document';
import './globals.css';

export const metadata = threadlineMetadata;

/** 保持 Electron renderer 可静态导出，不接触 Proxy nonce 或动态 API。 */
export default function ElectronRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ThreadlineDocument>{children}</ThreadlineDocument>;
}
