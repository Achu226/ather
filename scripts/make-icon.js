// Renders Maya's face to assets/: icon.png/.ico (purple) and icon-dark.png/.ico (black, for dark theme).
// node scripts/make-icon.js
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const face = (a, b, border) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="256" height="256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect x="6" y="14" width="108" height="92" rx="34" fill="url(#g)" ${border ? 'stroke="#55555f" stroke-width="2.5"' : ''}/>
  <rect x="16" y="22" width="88" height="26" rx="13" fill="#fff" opacity="0.1"/>
  <rect x="34" y="40" width="15" height="25" rx="7.5" fill="#fff"/>
  <rect x="71" y="40" width="15" height="25" rx="7.5" fill="#fff"/>
  <circle cx="27" cy="74" r="7" fill="#ff8fc7" opacity="0.5"/>
  <circle cx="93" cy="74" r="7" fill="#ff8fc7" opacity="0.5"/>
  <path d="M48 78 Q60 91 72 78" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>`;

/** A one-image .ico that embeds the 256 px PNG (supported since Windows Vista). */
export function toIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(0, 6); // width 256
  header.writeUInt8(0, 7); // height 256
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // image offset
  return Buffer.concat([header, png]);
}

if (process.argv[1]?.endsWith('make-icon.js')) {
  mkdirSync('assets', { recursive: true });
  for (const [name, svg] of [['icon', face('#6c5cff', '#a35cff', false)], ['icon-dark', face('#0d0d10', '#2c2c33', true)]]) {
    const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
    writeFileSync(`assets/${name}.png`, png);
    writeFileSync(`assets/${name}.ico`, toIco(png));
  }
  console.log('assets/icon(.png/.ico) and assets/icon-dark(.png/.ico) written');
}
