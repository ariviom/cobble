import type { Page } from 'playwright';

async function search(page: Page, query: string) {
  const searchInput = page.getByLabel('Search sets');
  await searchInput.click();
  await searchInput.fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

export async function run(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/search`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const resultCard = page.locator('[data-video-target="set-card"]');

  // --- Search by set number ---
  await search(page, '10497');

  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500);

  // Grab the set name from the first result for the name search later
  const setNameEl = page.locator('[data-video-target="set-card-name"]').first();
  const setName = (await setNameEl.textContent()) ?? 'Galaxy Explorer';

  // Click the first result to open the detail modal
  await resultCard.first().click();
  await page.waitForTimeout(2500);

  // Dismiss the modal
  await page.getByLabel('Close').click();
  await page.waitForTimeout(1000);

  // Clear the search field
  await page.getByLabel('Clear search').click();
  await page.waitForTimeout(500);

  // --- Search again by name ---
  await search(page, setName);

  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500);

  // Open the result
  await resultCard.first().click();
  await page.waitForTimeout(2500);

  // Dismiss and clear for seamless looping
  await page.getByLabel('Close').click();
  await page.waitForTimeout(500);
  await page.getByLabel('Clear search').click();
  await page.waitForTimeout(1000);
}
