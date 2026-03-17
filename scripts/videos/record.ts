/**
 * Video recording using Playwright's built-in video + FFmpeg remux.
 *
 * Usage:
 *   npx tsx scripts/videos/record.ts <script-name> [options]
 *
 * Options:
 *   --viewport  desktop | mobile | all   (default: desktop)
 *   --theme     light | dark | all       (default: light)
 *   --color     blue | yellow | purple | red | green | all  (default: yellow)
 *   --url       Base URL (default: https://brick-party.com)
 *   --serial    Run variants one at a time (default: parallel, max 4)
 *
 * Output: scripts/videos/output/<script>-<viewport>-<theme>-<color>.mp4
 *
 * Prerequisites:
 *   - App running at localhost:3000
 *   - FFmpeg installed
 *   - npm install -D playwright && npx playwright install chromium
 */

import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { buildZoompanFilter, type ZoomKeyframe } from './zoom';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(__dirname, 'output');
const DEFAULT_URL = 'https://brick-party.com';
const DEFAULT_CONCURRENCY = 4;
const RECORDING_FPS = 25;

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
} as const;

const THEMES = ['light', 'dark'] as const;

const COLORS = ['blue', 'yellow', 'purple', 'red', 'green'] as const;

type Viewport = keyof typeof VIEWPORTS;
type Theme = (typeof THEMES)[number];
type Color = (typeof COLORS)[number];

interface Variant {
  viewport: Viewport;
  theme: Theme;
  color: Color;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const scriptName = args.find(a => !a.startsWith('--'));
  if (!scriptName) {
    console.error(
      'Usage: npx tsx scripts/videos/record.ts <script-name> [--viewport desktop|mobile|all] [--theme light|dark|all] [--color blue|yellow|...|all] [--url <base-url>] [--serial]'
    );
    process.exit(1);
  }

  const serial = args.includes('--serial');

  const urlIdx = args.indexOf('--url');
  const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : DEFAULT_URL;

  const ssIdx = args.indexOf('--storage-state');
  const storageState = ssIdx >= 0 ? args[ssIdx + 1] : undefined;

  function flag(
    name: string,
    allowed: readonly string[],
    fallback: string
  ): string[] {
    const idx = args.indexOf(`--${name}`);
    const val = idx >= 0 ? args[idx + 1] : fallback;
    if (val === 'all') return [...allowed];
    if (!allowed.includes(val)) {
      console.error(
        `Invalid --${name} "${val}". Allowed: ${allowed.join(', ')}, all`
      );
      process.exit(1);
    }
    return [val];
  }

  const viewports = flag(
    'viewport',
    Object.keys(VIEWPORTS),
    'desktop'
  ) as Viewport[];
  const themes = flag(
    'theme',
    THEMES as unknown as string[],
    'light'
  ) as Theme[];
  const colors = flag(
    'color',
    COLORS as unknown as string[],
    'yellow'
  ) as Color[];

  // Build variant matrix
  const variants: Variant[] = [];
  for (const viewport of viewports) {
    for (const theme of themes) {
      for (const color of colors) {
        variants.push({ viewport, theme, color });
      }
    }
  }

  return { scriptName, variants, serial, baseUrl, storageState };
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

async function recordVariant(
  scenarioRun: (
    page: Page,
    baseUrl: string
  ) => Promise<{ trimStart?: number; zoomKeyframes?: ZoomKeyframe[] } | void>,
  scriptName: string,
  variant: Variant,
  baseUrl: string,
  storageState?: string
) {
  const { viewport, theme, color } = variant;
  const label = `${scriptName}-${viewport}-${theme}-${color}`;
  const videoDir = join(OUTPUT_DIR, `video-${label}`);

  mkdirSync(videoDir, { recursive: true });

  const vp = VIEWPORTS[viewport];
  const isDesktop = viewport !== 'mobile';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: viewport === 'mobile' ? 2 : 1,
    isMobile: viewport === 'mobile',
    hasTouch: viewport === 'mobile',
    recordVideo: { dir: videoDir, size: vp },
    ...(storageState ? { storageState } : {}),
  });

  // Dev servers may be slow on first compile
  context.setDefaultNavigationTimeout(60_000);
  context.setDefaultTimeout(30_000);

  // Inject theme preferences before any page scripts run.
  // addInitScript runs after the document is created but before page scripts,
  // so we can set both localStorage (for next-themes) and the dark class
  // directly on <html> (to match what the server would have sent).
  await context.addInitScript(
    ({ theme, color }: { theme: string; color: string }) => {
      localStorage.setItem('userTheme', theme);
      localStorage.setItem('userThemeColor', color);
      // Bypass forcedTheme:'light' for anonymous users so dark mode works
      localStorage.setItem('theme:override', 'true');
      // Apply dark class before any rendering to avoid light flash
      if (theme === 'dark' && document.documentElement) {
        document.documentElement.classList.add('dark');
      }
      // Suppress onboarding tour in recordings
      localStorage.setItem(
        'onboarding:progress',
        JSON.stringify({ completedSteps: [], dismissed: true })
      );
    },
    { theme, color }
  );

  const videoStartMs = Date.now();
  const page = await context.newPage();

  // Warm-up: run scenario once, capturing API responses for instant replay.
  // The warm-up is recorded but trimmed — preScenarioSec covers it.
  const apiCache = new Map<
    string,
    { status: number; headers: Record<string, string>; body: Buffer }
  >();
  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      try {
        const body = await response.body();
        apiCache.set(response.url(), {
          status: response.status(),
          headers: response.headers(),
          body,
        });
      } catch {}
    }
  });

  await scenarioRun(page, baseUrl).catch(() => {});

  // Intercept API calls in the real run with cached responses
  await page.route('**/api/**', async (route, request) => {
    const cached = apiCache.get(request.url());
    if (cached) {
      await route.fulfill(cached);
    } else {
      await route.continue();
    }
  });

  // Real run: API calls served instantly from cache
  const scenarioStartMs = Date.now();
  const scenarioResult = await scenarioRun(page, baseUrl);

  // Save video — saveAs waits for the page to close and video to finalize
  const video = page.video();
  if (!video) throw new Error(`No video for ${label}`);

  const webmPath = join(videoDir, `${label}.webm`);
  await page.close();
  await video.saveAs(webmPath);
  await browser.close();

  // Trim loading time and remux webm → mp4
  const outputPath = join(OUTPUT_DIR, `${label}.mp4`);
  const preScenarioSec = (scenarioStartMs - videoStartMs) / 1000;
  const scenarioTrimSec =
    scenarioResult &&
    typeof scenarioResult === 'object' &&
    'trimStart' in scenarioResult
      ? (scenarioResult.trimStart ?? 0)
      : 0;
  const trimStart = preScenarioSec + scenarioTrimSec;
  const ssFlag = trimStart > 0.5 ? `-ss ${trimStart.toFixed(2)}` : '';

  // Build video filter: zoom + scale for desktop, passthrough for mobile
  let vfFlag = '';
  if (isDesktop) {
    const zoomKeyframes =
      scenarioResult &&
      typeof scenarioResult === 'object' &&
      'zoomKeyframes' in scenarioResult
        ? (scenarioResult.zoomKeyframes as ZoomKeyframe[] | undefined)
        : undefined;

    const zpFilter = zoomKeyframes?.length
      ? buildZoompanFilter(
          zoomKeyframes,
          scenarioTrimSec,
          vp.width,
          vp.height,
          vp.width,
          vp.height,
          1, // scaleFactor: CSS pixels = recording pixels at 1x
          RECORDING_FPS
        )
      : null;

    if (zpFilter) {
      vfFlag = `-vf "fps=${RECORDING_FPS},${zpFilter}"`;
    }
  }

  execSync(
    `ffmpeg -y ${ssFlag} -i "${webmPath}" ${vfFlag} -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p "${outputPath}"`,
    { stdio: 'pipe' }
  );

  // Clean up temp dir
  execSync(`rm -rf "${videoDir}"`);

  console.log(`  ✓ ${label}.mp4`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  /** Stagger start of each worker by this many ms to avoid thundering herd. */
  staggerMs = 2000
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(workerIdx: number) {
    if (workerIdx > 0 && staggerMs > 0) {
      await new Promise(r => setTimeout(r, workerIdx * staggerMs));
    }
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    (_, i) => worker(i)
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { scriptName, variants, serial, baseUrl, storageState } = parseArgs();
  const scenario = await import(`./scenarios/${scriptName}`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Clean previous outputs for this script
  const { readdirSync, unlinkSync } = await import('fs');
  for (const file of readdirSync(OUTPUT_DIR)) {
    if (file.startsWith(`${scriptName}-`) && file.endsWith('.mp4')) {
      unlinkSync(join(OUTPUT_DIR, file));
    }
  }

  const concurrency = serial ? 1 : DEFAULT_CONCURRENCY;

  console.log(
    `Recording "${scriptName}" — ${variants.length} variant${variants.length > 1 ? 's' : ''} (${serial ? 'serial' : `up to ${concurrency} parallel`}):`
  );
  for (const v of variants) {
    console.log(`  • ${v.viewport} / ${v.theme} / ${v.color}`);
  }
  console.log();

  const outputs = await mapWithConcurrency(variants, concurrency, variant =>
    recordVariant(scenario.run, scriptName, variant, baseUrl, storageState)
  );

  console.log(
    `\nDone — ${outputs.length} video${outputs.length > 1 ? 's' : ''} saved.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
