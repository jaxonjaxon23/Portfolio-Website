// tools/make-icons.mjs — makes the tab / home-screen icons from favicon.svg:
//   favicon.ico (16/32/48, for browsers and tools that ask for /favicon.ico)
//   apple-touch-icon.png (180px, iPhone/iPad home screen)
// Edit favicon.svg, then run `node tools/make-icons.mjs` and commit the results.

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile('favicon.svg');
const png = (size) => sharp(svg, { density: 72 * size / 64 * 4 }).resize(size, size).png().toBuffer();

// ICO = small header + directory + embedded PNGs
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
await writeFile('favicon.ico', Buffer.concat([header, ...dir, ...pngs]));

// home-screen icon: square, no transparency (iOS fills it black otherwise)
await writeFile('apple-touch-icon.png', await sharp(svg, { density: 72 * 180 / 64 * 2 }).resize(180, 180)
  .flatten({ background: '#0b0c0d' }).png().toBuffer());
console.log('favicon.ico + apple-touch-icon.png made from favicon.svg');
