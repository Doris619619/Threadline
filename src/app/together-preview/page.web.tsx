/** @fileoverview 仅显式启用的 Next development 预览；正式构建和部署一律 404。 */
import { notFound } from 'next/navigation';
import { TogetherPreview } from '@/features/together/preview';
/** 本地展示使用独立 PostgreSQL 测试身份，不绕过正式应用认证。 */
export default function TogetherPreviewPage() {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.THREADLINE_TOGETHER_PREVIEW !== 'true' ||
    process.env.VERCEL_ENV
  )
    notFound();
  return <TogetherPreview />;
}
