#!/usr/bin/env node
/**
 * Generate PWA icons and favicon from the SVG logo.
 * White logo on a colored circle background.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PWA_BG = '#016cb8';
const FAVICON_BG = '#f2d300'; // Yellow for Google SEO fallback
const FAVICON_LOGO_FILL = '#1a1600'; // Dark text on yellow

const logoPaths = `
  <path d="M489.34 232.72 287.26 132.36c-9.76-4.85-20.37-7.27-30.97-7.27s-21.54 2.5-31.42 7.49l-59.5 30.09 29.04 14.42c17.26-7.11 38.55-11.31 61.6-11.31 57.57 0 104.23 26.19 104.23 58.49v23.95c0 32.3-46.67 58.49-104.23 58.49s-104.23-26.19-104.23-58.49V224.28c0-6.6 1.95-12.94 5.53-18.85l-38.6-19.17-96.16 48.62c-12.79 6.47-12.72 24.75.11 31.13l202.08 100.36c9.76 4.85 20.37 7.27 30.97 7.27s21.54-2.5 31.42-7.49l202.31-102.29c12.79-6.47 12.72-24.75-.11-31.13Z"/>
  <path d="M256 183.72c-49.38 0-86.29 21.4-86.29 40.54s36.9 40.54 86.29 40.54 86.29-21.4 86.29-40.54-36.9-40.54-86.29-40.54Z"/>`;

function makeSvg(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g fill="${fill}">${logoPaths}
  </g>
</svg>`;
}

async function generateIcon(size, outputPath, { bgColor, logoFill }) {
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${bgColor}"/>
    </svg>`
  );

  const logoSize = Math.round(size * 0.75);
  const logoBuffer = await sharp(Buffer.from(makeSvg(logoFill)))
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - logoSize) / 2);

  await sharp(circle)
    .composite([{ input: logoBuffer, left: offset, top: offset }])
    .png()
    .toFile(outputPath);

  console.log(`Generated ${outputPath} (${size}x${size})`);
}

async function generateFavicon(outputPath, { bgColor, logoFill }) {
  const size = 32;
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${bgColor}"/>
    </svg>`
  );

  const logoSize = Math.round(size * 0.75);
  const logoBuffer = await sharp(Buffer.from(makeSvg(logoFill)))
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - logoSize) / 2);

  const pngBuffer = await sharp(circle)
    .composite([{ input: logoBuffer, left: offset, top: offset }])
    .png()
    .toBuffer();

  // ICO format: header + directory entry + PNG data
  const ico = Buffer.alloc(6 + 16 + pngBuffer.length);
  ico.writeUInt16LE(0, 0);      // reserved
  ico.writeUInt16LE(1, 2);      // type: icon
  ico.writeUInt16LE(1, 4);      // count: 1
  ico.writeUInt8(size, 6);      // width
  ico.writeUInt8(size, 7);      // height
  ico.writeUInt8(0, 8);         // color palette
  ico.writeUInt8(0, 9);         // reserved
  ico.writeUInt16LE(1, 10);     // color planes
  ico.writeUInt16LE(32, 12);    // bits per pixel
  ico.writeUInt32LE(pngBuffer.length, 14); // size
  ico.writeUInt32LE(22, 18);    // offset (6 + 16)
  pngBuffer.copy(ico, 22);

  writeFileSync(outputPath, ico);
  console.log(`Generated ${outputPath} (${size}x${size} ICO)`);
}

async function main() {
  // PWA icons: white logo on theme blue
  await generateIcon(192, join(root, 'public/logo/brickparty_logo_sm.png'), { bgColor: PWA_BG, logoFill: '#ffffff' });
  await generateIcon(512, join(root, 'public/logo/brickparty_logo.png'), { bgColor: PWA_BG, logoFill: '#ffffff' });
  // ICO favicon: dark logo on yellow (Google SEO fallback)
  await generateFavicon(join(root, 'app/favicon.ico'), { bgColor: FAVICON_BG, logoFill: FAVICON_LOGO_FILL });
  console.log('Done!');
}

main().catch(console.error);
