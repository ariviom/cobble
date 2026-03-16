/**
 * Video recording template using Playwright + CDP Screencast + FFmpeg.
 *
 * Usage:
 *   npx tsx scripts/videos/record.ts <script-name>
 *
 * Each script in scripts/videos/scenarios/ exports a `run` function
 * that receives a Playwright Page and performs scripted interactions.
 *
 * Output: scripts/videos/output/<script-name>.mp4
 *
 * Prerequisites:
 *   - App running at localhost:3000
 *   - FFmpeg installed
 *   - npm install playwright (dev dependency)
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = join(__dirname, 'output');
const FRAMES_DIR = join(OUTPUT_DIR, 'frames');
const VIEWPORT = { width: 1280, height: 720 };
const BASE_URL = 'http://localhost:3000';

async function main() {
  const scriptName = process.argv[2];
  if (!scriptName) {
    console.error('Usage: npx tsx scripts/videos/record.ts <script-name>');
    process.exit(1);
  }

  // Dynamic import of scenario script
  const scenario = await import(`./scenarios/${scriptName}`);

  mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Start CDP screencast
  const client = await page.context().newCDPSession(page);
  let frameIndex = 0;

  client.on('Page.screencastFrame', async params => {
    const framePath = join(
      FRAMES_DIR,
      `frame_${String(frameIndex).padStart(5, '0')}.png`
    );
    writeFileSync(framePath, Buffer.from(params.data, 'base64'));
    frameIndex++;
    await client.send('Page.screencastFrameAck', {
      sessionId: params.sessionId,
    });
  });

  await client.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
  });

  // Run the scenario
  await page.goto(BASE_URL);
  await scenario.run(page);

  // Stop screencast
  await client.send('Page.stopScreencast');
  await browser.close();

  // Encode with FFmpeg
  const outputPath = join(OUTPUT_DIR, `${scriptName}.mp4`);
  execSync(
    `ffmpeg -y -framerate 30 -i "${FRAMES_DIR}/frame_%05d.png" -c:v libx264 -crf 18 -pix_fmt yuv420p "${outputPath}"`,
    { stdio: 'inherit' }
  );

  // Clean up frames
  execSync(`rm -rf "${FRAMES_DIR}"`);

  console.log(`Video saved to: ${outputPath}`);
}

main().catch(console.error);
