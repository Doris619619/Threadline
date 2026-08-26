/**
 * @fileoverview 工作台首页入口，在业务 Provider 前按 Electron role 分流。
 */

import { ThreadlineRoot } from '@/components/threadline-root';

/** 渲染由 role 分流后的业务主窗口或 Edge 轻量窗口。 */
export default function Home() {
  return <ThreadlineRoot />;
}
