import type {
  ScenarioConfig,
  ScenarioContext,
  BaseTiming,
  BaseZoom,
  RunResult,
} from '../context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchSetTiming extends BaseTiming {
  dwellOnResults: number;
  dwellOnCard: number;
  dwellOnModal: number;
  dwellOnOwnedMark: number;
  dwellOnModalView: number;
  zoomToModal: number;
  postClose: number;
}

interface SearchSetZoom extends BaseZoom {
  searchInput: number;
}

interface SearchSetConfig
  extends ScenarioConfig<SearchSetTiming, SearchSetZoom> {
  setNumber: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const config: SearchSetConfig = {
  name: 'search-set',
  description: 'Search by set number, mark owned, search by name',
  setNumber: '10497',
  warmStart: true,
  timing: {
    initialPause: 800,
    zoomTransition: 500,
    panTransition: 500,
    typingBase: [50, 150],
    typingPauseChance: 0.1,
    dwellOnResults: 1000,
    dwellOnCard: 400,
    dwellOnModal: 800,
    dwellOnOwnedMark: 1200,
    dwellOnModalView: 2000,
    zoomToModal: 600,
    postClose: 500,
  },
  zoom: {
    searchInput: 1.8,
    modalFraming: 1.25,
    modalCenterOffset: 0.05,
  },
};

// ---------------------------------------------------------------------------
// Warm-up
// ---------------------------------------------------------------------------

export async function warmUp(
  ctx: ScenarioContext<SearchSetConfig>
): Promise<void> {
  const { page, baseUrl, config: c } = ctx;

  // Navigate and wait for idle
  await page.goto(`${baseUrl}/search`);
  await page.waitForLoadState('networkidle');

  const searchInput = page.getByLabel('Search sets');
  const resultCard = page.locator('[data-video-target="set-card"]');

  // Search by set number
  await searchInput.click();
  await ctx.typeNaturally(c.setNumber);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await ctx.wait(2000);

  // Grab set name for second search
  const setNameEl = page.locator('[data-video-target="set-card-name"]').first();
  const setName = ((await setNameEl.textContent()) ?? 'Galaxy Explorer').trim();

  // Clear and search by name
  await page.getByLabel('Clear search').click();
  await ctx.wait(500);
  await searchInput.click();
  await ctx.typeNaturally(setName);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await ctx.wait(2000);

  // Open modal, wait, close
  await resultCard.first().click();
  await ctx.wait(1500);
  await page.getByRole('dialog').getByLabel('Close').click();

  // Clear search
  await page.getByLabel('Clear search').click();
  await ctx.wait(500);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  ctx: ScenarioContext<SearchSetConfig>
): Promise<RunResult> {
  const { page, baseUrl, config: c } = ctx;
  const t = c.timing;
  const z = c.zoom;

  // --- Page load (trimmed from final video) ---
  if (!c.warmStart) {
    await page.goto(`${baseUrl}/search`);
    await page.waitForLoadState('networkidle');
  }
  await ctx.wait(200);
  const trimStart = ctx.elapsed();

  // --- Visible content starts here ---
  ctx.mark(1);
  await ctx.wait(t.initialPause);

  const searchInput = page.getByLabel('Search sets');
  const resultCard = page.locator('[data-video-target="set-card"]');

  // === Search by set number ===

  // Zoom into search area
  const searchCenter = await ctx.centerOf(searchInput);
  ctx.mark(1);
  await ctx.wait(t.zoomTransition);
  ctx.mark(z.searchInput, searchCenter);

  await searchInput.click();
  await ctx.typeNaturally(c.setNumber);
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  // Wait for results while still zoomed on search
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await ctx.wait(t.dwellOnCard);

  // Grab the set name for the second search
  const setNameEl = page.locator('[data-video-target="set-card-name"]').first();
  const setName = ((await setNameEl.textContent()) ?? 'Galaxy Explorer').trim();

  // Pan to first result card (stay zoomed)
  const cardCenter = await ctx.centerOf(resultCard.first());
  ctx.mark(z.searchInput, searchCenter);
  await ctx.wait(t.panTransition);
  ctx.mark(z.searchInput, cardCenter);
  await ctx.wait(t.dwellOnCard);

  // Zoom out before opening card
  ctx.mark(z.searchInput, cardCenter);
  await ctx.wait(t.zoomToModal);
  ctx.mark(1);
  await ctx.wait(t.dwellOnCard);

  // Click card to open modal
  await resultCard.first().click();
  await ctx.wait(t.dwellOnModal);

  // Mark as owned from the modal
  const ownedBtn = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Owned' });
  if (await ownedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ownedBtn.click();
    await ctx.wait(t.dwellOnOwnedMark);
  }

  // Close any sign-in dialog, then the set modal
  const signInDialog = page.getByRole('dialog', { name: 'Sign in' });
  if (await signInDialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await signInDialog.getByLabel('Close').click();
    await ctx.wait(300);
  }

  // Close modal
  await page.getByRole('dialog').getByLabel('Close').click();
  await ctx.wait(t.postClose);

  // Clear search
  await page.getByLabel('Clear search').click();
  await ctx.wait(t.postClose);

  // === Search again by name ===

  // Zoom into search area
  const searchCenter2 = await ctx.centerOf(searchInput);
  ctx.mark(1);
  await ctx.wait(t.zoomTransition);
  ctx.mark(z.searchInput, searchCenter2);

  await searchInput.click();
  await ctx.typeNaturally(setName);
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  // Wait for results while zoomed
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await ctx.wait(t.dwellOnCard);

  // Pan to first result card
  const cardCenter2 = await ctx.centerOf(resultCard.first());
  ctx.mark(z.searchInput, searchCenter2);
  await ctx.wait(t.panTransition);
  ctx.mark(z.searchInput, cardCenter2);
  await ctx.wait(t.dwellOnCard);

  // Zoom out before opening card
  ctx.mark(z.searchInput, cardCenter2);
  await ctx.wait(t.zoomToModal);
  ctx.mark(1);
  await ctx.wait(t.dwellOnCard);

  // Click card to open modal
  await resultCard.first().click();
  await ctx.wait(t.dwellOnModalView);

  // Close modal
  await page.getByLabel('Close').click();
  await ctx.wait(t.postClose);

  // Clean up
  await page.getByLabel('Clear search').click();
  await ctx.wait(t.dwellOnResults);

  return { trimStart };
}
