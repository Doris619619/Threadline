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

/** Draw the user's twin tails, glasses and three outfit silhouettes on a consistent pixel grid. */
export function CottageAvatar({ outfit = 'blue' }: { outfit?: CottageOutfit }) {
  return (
    <svg
      className="cottage-avatar"
      data-outfit={outfit}
      viewBox="0 0 48 64"
      width="48"
      height="64"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <ellipse cx="24" cy="61" rx="15" ry="2" fill="var(--pixel-shadow)" />
      <g stroke="var(--pixel-ink)" strokeWidth="1" strokeLinejoin="miter">
        <path
          fill="var(--avatar-hair-shadow)"
          d="M13 10H7v5H5v12H3v18h2v7h6v-3h3V31h3V14zM35 10h6v5h2v12h2v18h-2v7h-6v-3h-3V31h-3V14z"
        />
        <path
          fill="var(--avatar-hair)"
          d="M8 16h4v15h-2v13H7V30H6V20h2zM36 16h4v4h2v10h-1v14h-3V31h-2z"
          stroke="none"
        />
        <path
          fill="var(--avatar-hair-light)"
          d="M8 19h2v14H8zM38 19h2v14h-2zM5 37h2v10H5zM41 37h2v10h-2z"
          stroke="none"
        />
        <path
          fill="var(--avatar-skin)"
          d="M18 44h5v13h-1v3h-5v-5h1zM25 44h5v11h1v5h-5v-3h-1z"
        />
        <path
          fill="var(--avatar-clothes)"
          d="M17 55h6v5h-1v2h-8v-3h3zM25 55h6v4h3v3h-8v-2h-1z"
        />
        <path
          fill="var(--avatar-skin)"
          d="M16 30h-3v3h-2v8h4v-5h3zM32 30h3v3h2v8h-4v-5h-3z"
        />
        <path
          fill="var(--avatar-clothes)"
          d={
            outfit === 'casual'
              ? 'M17 29h14v4h3v12H14V33h3z'
              : 'M19 29h10v7h2v4h3v4h2v4H12v-4h2v-4h3v-4h2z'
          }
        />
        <path
          fill="var(--avatar-white)"
          d={
            outfit === 'casual'
              ? 'M20 30h8v4h-8zM18 36h12v5H18z'
              : 'M19 30h3v5h-3zM26 30h3v5h-3zM15 43h3v3h-3zM21 39h3v7h-3zM28 42h3v4h-3z'
          }
          stroke="none"
        />
        {outfit === 'pink' && (
          <path
            fill="var(--avatar-hair)"
            d="M14 29h5v13h-5v-4h-3v-5h3zM29 29h5v4h3v5h-3v4h-5z"
          />
        )}
        {outfit === 'casual' && (
          <path fill="var(--avatar-denim)" d="M14 44h20v6h-9v-3h-2v3h-9z" />
        )}
        <path
          fill="var(--avatar-hair-shadow)"
          d="M16 5h16v2h4v5h2v12h-3v4H13v-4h-3V12h2V7h4z"
        />
        <path fill="var(--avatar-skin)" d="M15 14h18v12h-3v3H18v-3h-3z" />
        <path
          fill="var(--avatar-hair)"
          d="M16 7h16v3h3v9h-4v-6h-3v6h-4v-7h-3v6h-6v-7h1z"
        />
        <path
          fill="var(--avatar-hair-light)"
          d="M17 9h3v6h-3zM25 9h3v3h-3zM30 10h2v5h-2z"
          stroke="none"
        />
        <path fill="var(--avatar-eye)" d="M17 20h4v5h-4zM27 20h4v5h-4z" stroke="none" />
        <path
          fill="var(--avatar-white)"
          d="M17 20h2v2h-2zM27 20h2v2h-2zM22 26h4v1h-4z"
          stroke="none"
        />
        <path
          fill="var(--avatar-blush)"
          d="M15 25h4v2h-4zM29 25h4v2h-4z"
          stroke="none"
        />
        {outfit === 'pink' ? (
          <>
            <path fill="var(--avatar-eye)" d="M14 6h3V3h14v3h3v7H14z" />
            <path fill="var(--avatar-blush)" d="M22 5h6v4h-6z" stroke="none" />
          </>
        ) : (
          <>
            <path fill="var(--avatar-white)" d="M14 7h9v7h-9zM25 7h9v7h-9z" />
            <path
              fill="var(--avatar-eye)"
              d="M16 9h5v3h-5zM27 9h5v3h-5zM23 9h2v2h-2z"
              stroke="none"
            />
          </>
        )}
        <path fill="var(--avatar-white)" d="M10 14h4v3h-4zM34 14h4v3h-4z" />
      </g>
    </svg>
  );
}
