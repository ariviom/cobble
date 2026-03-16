import type { Page } from 'playwright';

export async function run(page: Page) {
  // Navigate to search
  await page.goto('http://localhost:3000/search');
  await page.waitForTimeout(1000);

  // Type a search query
  const searchInput = page.getByPlaceholder(/search/i);
  await searchInput.click();
  await searchInput.type('10497', { delay: 100 });
  await page.waitForTimeout(2000);

  // Click first result (adjust selector as needed)
  // await page.locator('[data-testid="search-result"]').first().click();
  // await page.waitForTimeout(2000);
}
