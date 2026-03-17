import type { Page, Locator } from 'playwright';
import type { BaseTiming } from './context';

/**
 * Type each character with human-like variable delays.
 */
export async function typeNaturally(
  page: Page,
  text: string,
  timing: BaseTiming
): Promise<void> {
  const [min, max] = timing.typingBase;
  for (const char of text) {
    await page.keyboard.type(char);
    const delay = min + Math.random() * (max - min);
    const pause = Math.random() < timing.typingPauseChance ? 200 : 0;
    await page.waitForTimeout(delay + pause);
  }
}

/**
 * Get the center point of a locator in CSS viewport pixels.
 */
export async function centerOf(
  locator: Locator
): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element not visible for zoom target');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
