/** @fileoverview Compact original pixel furnishings shared by navigation, wardrobe and page details. */
import type { ReactNode } from 'react';

export type CottageSpriteName =
  | 'home'
  | 'calendar'
  | 'projects'
  | 'insights'
  | 'rhythm'
  | 'settings'
  | 'flower'
  | 'cat'
  | 'star';

/** Keep the established navigation icon footprint; only the cottage theme reveals the pixel alternative. */
export function CottageNavIcon({
  name,
  children,
}: {
  name: CottageSpriteName;
  children: ReactNode;
}) {
  return (
    <span className="cottage-nav-icon">
      <span className="cottage-standard-icon">{children}</span>
      <CottageSprite name={name} />
    </span>
  );
}

/** Load one local SVG symbol without adding a raster request or accessible duplicate label. */
export function CottageSprite({
  name,
  className = '',
}: {
  name: CottageSpriteName;
  className?: string;
}) {
  return (
    <svg
      className={`cottage-sprite ${className}`}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <use href={`/themes/cottage/pixels.svg#${name}`} />
    </svg>
  );
}

export type CottageOutfit = 'blue' | 'pink' | 'casual';

/** Display the reference-driven sprite in the existing footprint; the outfit stays decorative and device-local. */
export function CottageAvatar({ outfit = 'blue' }: { outfit?: CottageOutfit }) {
  return (
    <span className="cottage-avatar" data-outfit={outfit} aria-hidden="true">
      {/* Static local sprites also work in Electron exports without an image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/themes/cottage/avatar-${outfit}.webp`}
        width={256}
        height={355}
        alt=""
        draggable={false}
      />
    </span>
  );
}
