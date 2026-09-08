/** @fileoverview Presents a reserved-size decorative character, visible only in the Anya theme. */
import Image from 'next/image';

/** Empty alt text keeps purely decorative artwork out of the task reading order. */
export function ThemeIllustration({ className = '' }: { className?: string }) {
  return (
    <Image
      className={`theme-illustration ${className}`}
      src="/themes/anya/notebook.webp"
      width={120}
      height={120}
      alt=""
      unoptimized
    />
  );
}
