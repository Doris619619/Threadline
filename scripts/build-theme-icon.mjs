/** @fileoverview 将已选定的粉色 PNG 转换为同源多尺寸 Windows ICO，不改变图案或颜色。 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const source = process.argv[2] ?? 'public/themes/anya/icon.png';
const png = await sharp(source).resize(512, 512).png().toBuffer();
await writeFile('public/themes/anya/icon.png', png);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) => sharp(png).resize(size, size).png().toBuffer()),
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
await writeFile('electron/assets/icon-anya.ico', Buffer.concat([header, ...images]));
