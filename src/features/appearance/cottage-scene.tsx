/** @fileoverview Personal room thumbnail reserved for the appearance chooser, never inserted in the task workspace. */
import Image from 'next/image';

/** Show the local reference artwork as a decorative preview with reserved dimensions. */
export function CottageScene() {
  return (
    <span className="cottage-scene">
      <Image
        className="cottage-room-image"
        src="/themes/cottage/personal-room.webp"
        width={1536}
        height={1024}
        alt=""
        loading="eager"
        unoptimized
      />
    </span>
  );
}
