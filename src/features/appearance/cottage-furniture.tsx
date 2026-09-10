/** @fileoverview Decorative personal furnishings and small finite sparkle clusters, independent of business state. */
export type CottageFurnitureName =
  'sofa' | 'swing' | 'claw' | 'tv' | 'lemonade' | 'desk' | 'bear';

/** Reuse the local 64px furniture atlas without adding focus targets or duplicate spoken content. */
export function CottageFurniture({
  name,
  className = '',
}: {
  name: CottageFurnitureName;
  className?: string;
}) {
  return (
    <svg
      className={`cottage-furniture ${className}`}
      data-furniture={name}
      viewBox="0 0 64 64"
      width="64"
      height="64"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <use href={`/themes/cottage/furniture.svg#${name}`} />
    </svg>
  );
}

/** Key this cluster to an explicit interaction so its finite CSS animation can restart without timers. */
export function CottageSparkles() {
  return (
    <span className="cottage-sparkles" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
