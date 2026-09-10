/** @fileoverview Export the approved three-outfit atlas into equal-size transparent local WebP sprites. */
import sharp from 'sharp';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Pass the approved 1774 × 887 generated atlas path.');
const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== 1774 || info.height !== 887)
  throw new Error(
    'Unexpected atlas dimensions; inspect cell boundaries before exporting.',
  );

// Two generator transparency attempts returned an RGB neutral matte. Only its mid-gray range is keyed;
// the brighter dress highlights and darker outlines remain intact. Final exports are visually checked on both surfaces.
for (let index = 0; index < data.length; index += 4) {
  const spread =
    Math.max(data[index], data[index + 1], data[index + 2]) -
    Math.min(data[index], data[index + 1], data[index + 2]);
  if (spread < 12 && data[index] > 95 && data[index] < 211) data[index + 3] = 0;
}

/** Remove isolated matte flecks after resizing, keeping the connected character artwork and its interior highlights. */
function removeMatteFlecks(pixels, width, height) {
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || !pixels[start * 4 + 3]) continue;
    const component = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const point = component[cursor];
      const x = point % width;
      const y = Math.floor(point / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || !pixels[next * 4 + 3]) continue;
          visited[next] = 1;
          component.push(next);
        }
    }
    if (component.length < 6) for (const point of component) pixels[point * 4 + 3] = 0;
  }
}

for (const [name, left, width] of [
  ['blue', 20, 610],
  ['pink', 650, 510],
  ['casual', 1220, 480],
]) {
  const cut = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({ left, top: 0, width, height: 887 })
    .png()
    .toBuffer();
  const padded = await sharp({
    create: { width: 640, height: 887, channels: 4, background: '#00000000' },
  })
    .composite([{ input: cut, left: Math.round((640 - width) / 2), top: 0 }])
    .png()
    .toBuffer();
  const pixels = await sharp(padded)
    .resize(256, 355, { kernel: 'nearest' })
    .raw()
    .toBuffer();
  removeMatteFlecks(pixels, 256, 355);
  const output = resolve(`public/themes/cottage/avatar-${name}.webp`);
  await sharp(pixels, { raw: { width: 256, height: 355, channels: 4 } })
    .webp({ lossless: true })
    .toFile(output);
  console.log(output);
}
