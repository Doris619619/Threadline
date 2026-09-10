/** @fileoverview 首帧即由主题 CSS 选择的配套品牌图标，避免 hydration 时闪回蓝色。 */
import Image from 'next/image';

/** 三套静态资源共享尺寸与可访问名称，隐藏版本不进入可访问树。 */
export function BrandIcon({
  size,
  className = '',
  alt = '',
}: {
  size: number;
  className?: string;
  alt?: string;
}) {
  return (
    <span className={`theme-brand-icon ${className}`}>
      <Image
        className="brand-icon-blue"
        src="/icon.png"
        alt={alt}
        width={size}
        height={size}
        unoptimized
      />
      <Image
        className="brand-icon-anya"
        src="/themes/anya/icon.png"
        alt={alt}
        width={size}
        height={size}
        unoptimized
      />
      <Image
        className="brand-icon-cottage"
        src="/themes/cottage/icon.svg"
        alt={alt}
        width={size}
        height={size}
        unoptimized
      />
    </span>
  );
}
