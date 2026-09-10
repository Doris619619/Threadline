/** @fileoverview Personal Picatown-inspired room art with independently rendered furniture, flowers and pet hit target. */
import Image from 'next/image';

export type CottageDecoration = 'star' | 'bunny' | 'hydrangea';

/** Small original white kitten icon; the room's kitten also has a full-size accessible HTML hit target. */
export function CottageCat({ happy = false }: { happy?: boolean }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <g className={happy ? 'cottage-cat-pop' : undefined}>
        <path fill="var(--room-ink)" d="M9 7h7v5h10V7h7v22h-4v6H11v-4H5v-9h4z" />
        <path fill="var(--room-cream)" d="M11 10h3v5h14v-5h3v17h-4v6H13v-4H7v-5h4z" />
        <path
          fill="var(--room-ink)"
          d={
            happy
              ? 'M14 18h5v2h-5zM24 18h5v2h-5zM20 23h3v2h-3z'
              : 'M15 17h3v4h-3zM25 17h3v4h-3zM20 23h3v2h-3z'
          }
        />
        <path fill="var(--room-rose)" d="M12 22h4v2h-4zM27 22h4v2h-4z" />
        <path fill="var(--room-blue)" d="M12 28h16v3H12z" />
        {happy && (
          <path
            className="cottage-heart"
            fill="var(--room-rose)"
            d="M18 2h4V0h4v2h4v4h-4v4h-4V6h-4z"
          />
        )}
      </g>
    </svg>
  );
}

/** Three original ornaments occupy the same open floor tile without altering the room image. */
function CottageFurniture({ decor }: { decor: CottageDecoration }) {
  return (
    <svg
      className="cottage-furniture"
      data-furniture={decor}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path fill="var(--room-shadow)" opacity=".35" d="m8 59 31-15 32 16-32 16z" />
      {decor === 'star' && (
        <>
          <path
            d="m39 21 10 15 20 4-12 13 2 14-20-7-21 5 4-15L10 38l20-2z"
            fill="var(--room-gold-dark)"
            stroke="var(--room-ink)"
            strokeWidth="1.5"
          />
          <path
            d="m39 16 10 15 20 4-12 13 2 14-20-7-21 5 4-15L10 33l20-2z"
            fill="var(--room-gold)"
            stroke="var(--room-gold-dark)"
            strokeWidth="2"
          />
          <path d="M30 37h3v4h-3zM46 37h3v4h-3zM36 44h8v2h-8z" fill="var(--room-ink)" />
          <path d="M26 43h6v2h-6zM48 43h6v2h-6z" fill="var(--room-rose)" />
        </>
      )}
      {decor === 'bunny' && (
        <>
          <path
            d="M22 8h10v25h14V8h10v28h5v25h-6v7H24v-7h-6V36h4z"
            fill="var(--room-cream)"
            stroke="var(--room-ink)"
            strokeWidth="1.5"
          />
          <path
            d="M25 13h4v19h-4zM49 13h4v19h-4zM23 52h7v3h-7zM49 52h7v3h-7z"
            fill="var(--room-rose)"
          />
          <path d="M29 43h3v5h-3zM47 43h3v5h-3zM37 51h6v3h-6z" fill="var(--room-ink)" />
          <path d="M30 61h20v7H30z" fill="var(--room-blue)" />
        </>
      )}
      {decor === 'hydrangea' && (
        <>
          <path
            d="m25 47 30 0-4 20H29z"
            fill="var(--room-blue)"
            stroke="var(--room-ink)"
            strokeWidth="1.5"
          />
          <path d="M22 43h37v8H22z" fill="var(--room-cream)" stroke="var(--room-ink)" />
          <path
            d="M36 21h7v27h-7zM18 34h15v8H18zM46 33h16v9H46z"
            fill="var(--room-leaf)"
          />
          <path
            d="M24 15h8V9h17v6h9v20h-8v7H31v-7h-9V22h2z"
            fill="var(--room-lilac)"
            stroke="var(--room-ink)"
          />
          <path
            d="M29 17h7v7h-7zM43 14h7v7h-7zM39 28h7v7h-7zM48 25h6v6h-6zM27 28h6v6h-6z"
            fill="var(--room-cream)"
          />
        </>
      )}
    </svg>
  );
}

/** The personal room is local artwork; theme lighting, finite feedback and furniture remain native accessible UI. */
export function CottageScene({
  decor = 'star',
  flowers = 0,
  happy = false,
  onPet,
}: {
  decor?: CottageDecoration;
  flowers?: number;
  happy?: boolean;
  onPet?: () => void;
}) {
  return (
    <span className="cottage-scene" data-decor={decor} data-happy={happy}>
      <Image
        className="cottage-room-image"
        src="/themes/cottage/personal-room.webp"
        width={1536}
        height={1024}
        alt=""
        loading="eager"
        unoptimized
      />
      <CottageFurniture decor={decor} />
      <span className="cottage-flowers" aria-hidden="true" data-flowers={flowers}>
        {Array.from({ length: flowers }, (_, index) => (
          <svg key={index} viewBox="0 0 16 24" fill="none" shapeRendering="crispEdges">
            <path d="M7 9h2v15H7zM2 16h5v3H2zM9 13h5v3H9z" fill="var(--room-leaf)" />
            <path d="M4 0h7v4h4v7h-4v4H4v-4H0V4h4z" fill="var(--room-rose)" />
            <path d="M5 5h5v5H5z" fill="var(--room-gold)" />
          </svg>
        ))}
      </span>
      {happy && (
        <span className="cottage-room-heart" aria-hidden="true">
          ♥
        </span>
      )}
      {onPet && (
        <button
          type="button"
          className="cottage-cat-target"
          aria-label="和房间里的小猫互动"
          onClick={onPet}
        />
      )}
    </span>
  );
}
