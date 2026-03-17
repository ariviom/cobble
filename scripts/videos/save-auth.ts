/**
 * Save a Playwright storage state (localStorage + cookies) for authenticated
 * video recordings.
 *
 * Usage:
 *   npx tsx scripts/videos/save-auth.ts [--url <base-url>]
 *
 * Opens a visible browser window. Log in via the app's normal auth flow, then
 * close the tab (not the browser). The storage state is saved to
 * scripts/videos/auth-state.json.
 *
 * Use with:
 *   npx tsx scripts/videos/record.ts <scenario> --storage-state scripts/videos/auth-state.json
 */

import { chromium } from 'playwright';
import { join } from 'path';

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : 'https://brick-party.com';
const outputPath = join(__dirname, 'auth-state.json');

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl);

  console.log('Log in via the browser window.');
  console.log('When done, close the tab to save your session.\n');

  // Wait for the page to be closed by the user
  await page.waitForEvent('close', { timeout: 0 });

  await context.storageState({ path: outputPath });
  await browser.close();

  console.log(`Auth state saved to ${outputPath}`);
  console.log(
    'Use it with: npx tsx scripts/videos/record.ts <scenario> --storage-state scripts/videos/auth-state.json'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
