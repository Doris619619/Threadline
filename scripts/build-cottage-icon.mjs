/** @fileoverview Render a validated cottage/classic SVG icon into bundled PNG and Windows ICO assets. */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const theme = process.argv[2] === 'classic' ? 'classic' : 'cottage';
const source = 'public/themes/' + theme + '/icon.svg';
await sharp(source)
  .resize(512, 512, { kernel: 'nearest' })
  .png()
  .toFile('public/themes/' + theme + '/icon.png');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(source).resize(size, size, { kernel: 'nearest' }).png().toBuffer(),
  ),
);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, image] of images.entries()) {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] % 256;
  header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
}
await writeFile(
  'electron/assets/icon-' + theme + '.ico',
  Buffer.concat([header, ...images]),
);
