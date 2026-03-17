import type { Page, Locator } from 'playwright';
import type { ZoomKeyframe } from '../zoom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type each character with human-like variable delays. */
async function typeNaturally(page: Page, text: string) {
  for (const char of text) {
    await page.keyboard.type(char);
    const base = 50 + Math.random() * 100;
    const pause = Math.random() < 0.1 ? 200 : 0;
    await page.waitForTimeout(base + pause);
  }
}

/** Get the center point of a locator in CSS viewport pixels. */
async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element not visible for zoom target');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

/** Viewport center — used for modal framing and full-view zoom-outs. */
/** Viewport center, shifted down 10% to better frame the set modal. */
const MODAL_CENTER = { x: 960, y: 594 };

export async function run(page: Page, baseUrl: string) {
  const zoomKeyframes: ZoomKeyframe[] = [];
  const t0 = Date.now();
  const mark = (zoom: number, center?: { x: number; y: number }) => {
    zoomKeyframes.push({ time: (Date.now() - t0) / 1000, zoom, center });
  };

  // --- Page load (trimmed from final video) ---
  await page.goto(`${baseUrl}/search`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  const trimStart = (Date.now() - t0) / 1000;

  // --- Visible content starts here ---
  mark(1);
  await page.waitForTimeout(800);

  const searchInput = page.getByLabel('Search sets');
  const resultCard = page.locator('[data-video-target="set-card"]');

  // === Search by set number ===

  // Zoom into search area
  const searchCenter = await centerOf(searchInput);
  mark(1);
  await page.waitForTimeout(500);
  mark(1.8, searchCenter);

  await searchInput.click();
  await typeNaturally(page, '10497');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  // Wait for results while still zoomed on search
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);

  // Grab the set name for the second search
  const setNameEl = page.locator('[data-video-target="set-card-name"]').first();
  const setName = (await setNameEl.textContent()) ?? 'Galaxy Explorer';

  // Pan to first result card (stay zoomed)
  const cardCenter = await centerOf(resultCard.first());
  mark(1.8, searchCenter);
  await page.waitForTimeout(500);
  mark(1.8, cardCenter);
  await page.waitForTimeout(400);

  // Click card to open modal
  await resultCard.first().click();
  await page.waitForTimeout(300);

  // Zoom out to modal framing (~1.25x centered on viewport)
  mark(1.8, cardCenter);
  await page.waitForTimeout(600);
  mark(1.25, MODAL_CENTER);
  await page.waitForTimeout(800);

  // Mark as owned from the modal (requires --storage-state for auth)
  const ownedBtn = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Owned' });
  if (await ownedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ownedBtn.click();
    await page.waitForTimeout(1200);
  }

  // Close any sign-in dialog, then the set modal
  const signInDialog = page.getByRole('dialog', { name: 'Sign in' });
  if (await signInDialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await signInDialog.getByLabel('Close').click();
    await page.waitForTimeout(300);
  }

  // Zoom out to full view while closing
  mark(1.25, MODAL_CENTER);
  await page.getByRole('dialog').getByLabel('Close').click();
  await page.waitForTimeout(500);
  mark(1);
  await page.waitForTimeout(500);

  // Clear search
  await page.getByLabel('Clear search').click();
  await page.waitForTimeout(500);

  // === Search again by name ===

  // Zoom into search area
  const searchCenter2 = await centerOf(searchInput);
  mark(1);
  await page.waitForTimeout(500);
  mark(1.8, searchCenter2);

  await searchInput.click();
  await typeNaturally(page, setName);
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  // Wait for results while zoomed
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);

  // Pan to first result card
  const cardCenter2 = await centerOf(resultCard.first());
  mark(1.8, searchCenter2);
  await page.waitForTimeout(500);
  mark(1.8, cardCenter2);
  await page.waitForTimeout(400);

  // Click card to open modal
  await resultCard.first().click();
  await page.waitForTimeout(300);

  // Zoom out to modal framing
  mark(1.8, cardCenter2);
  await page.waitForTimeout(600);
  mark(1.25, MODAL_CENTER);
  await page.waitForTimeout(2000);

  // Close and zoom to full view
  mark(1.25, MODAL_CENTER);
  await page.getByLabel('Close').click();
  await page.waitForTimeout(500);
  mark(1);
  await page.waitForTimeout(500);

  // Clean up
  await page.getByLabel('Clear search').click();
  await page.waitForTimeout(1000);

  return { trimStart, zoomKeyframes };
}
