/**
 * Extracted recording logic: launches a browser, runs a scenario with warm-up
 * caching, then post-processes the video with FFmpeg.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

import {
  createContext,
  type ScenarioConfig,
  type ScenarioContext,
  type RunResult,
  type ScenarioResult,
  type ZoomKeyframe,
} from './context';
import { buildZoompanFilter } from './zoom';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECORDING_FPS = 25;

export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Viewport = keyof typeof VIEWPORTS;

export interface Variant {
  viewport: Viewport;
  theme: 'light' | 'dark';
  color: 'blue' | 'yellow' | 'purple' | 'red' | 'green';
}

export interface ScenarioModule {
  config: ScenarioConfig;
  warmUp(ctx: ScenarioContext): Promise<void>;
  run(ctx: ScenarioContext): Promise<RunResult>;
}

// ---------------------------------------------------------------------------
// recordVariant
// ---------------------------------------------------------------------------

export async function recordVariant(
  scenario: ScenarioModule,
  scriptName: string,
  variant: Variant,
  baseUrl: string,
  outputDir: string,
  storageState?: string
): Promise<string> {
  const { viewport, theme, color } = variant;
  const label = `${scriptName}-${viewport}-${theme}-${color}`;
  const videoDir = join(outputDir, `video-${label}`);

  mkdirSync(videoDir, { recursive: true });

  const vp = VIEWPORTS[viewport];
  const isDesktop = viewport !== 'mobile';

  // ----- Browser & context -----
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: viewport === 'mobile' ? 2 : 1,
    isMobile: viewport === 'mobile',
    hasTouch: viewport === 'mobile',
    recordVideo: { dir: videoDir, size: vp },
    ...(storageState ? { storageState } : {}),
  });

  browserContext.setDefaultNavigationTimeout(60_000);
  browserContext.setDefaultTimeout(30_000);

  // Inject theme / color / onboarding preferences before page scripts run.
  await browserContext.addInitScript(
    ({ theme, color }: { theme: string; color: string }) => {
      localStorage.setItem('userTheme', theme);
      localStorage.setItem('userThemeColor', color);
      localStorage.setItem('theme:override', 'true');
      if (theme === 'dark' && document.documentElement) {
        document.documentElement.classList.add('dark');
      }
      localStorage.setItem(
        'onboarding:progress',
        JSON.stringify({ completedSteps: [], dismissed: true })
      );
    },
    { theme, color }
  );

  const videoStartMs = Date.now();
  const page = await browserContext.newPage();

  // ----- API response cache -----
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
      } catch {
        /* response may not be available (e.g. redirects) */
      }
    }
  });

  // ----- Warm-up run (discarded keyframes) -----
  const discardedKeyframes: ZoomKeyframe[] = [];
  const warmUpCtx = createContext(
    page,
    baseUrl,
    scenario.config,
    discardedKeyframes
  );
  await scenario.warmUp(warmUpCtx).catch(() => {});

  // ----- Install API cache route -----
  await page.route('**/api/**', async (route, request) => {
    const cached = apiCache.get(request.url());
    if (cached) {
      await route.fulfill(cached);
    } else {
      await route.continue();
    }
  });

  // ----- Real run -----
  const realKeyframes: ZoomKeyframe[] = [];
  const runCtx = createContext(page, baseUrl, scenario.config, realKeyframes);
  const scenarioStartMs = Date.now();
  const runResult = await scenario.run(runCtx);

  // Assemble ScenarioResult
  const scenarioResult: ScenarioResult = {
    trimStart: runResult.trimStart,
    zoomKeyframes: realKeyframes,
  };

  // ----- Save video -----
  const video = page.video();
  if (!video) throw new Error(`No video for ${label}`);

  const webmPath = join(videoDir, `${label}.webm`);
  await page.close();
  await video.saveAs(webmPath);
  await browser.close();

  // ----- FFmpeg post-processing -----
  // All paths below are internally derived — no user input reaches the shell.
  const outputPath = join(outputDir, `${label}.mp4`);
  const preScenarioSec = (scenarioStartMs - videoStartMs) / 1000;
  const trimTotal = preScenarioSec + scenarioResult.trimStart;
  const ssFlag = trimTotal > 0.5 ? `-ss ${trimTotal.toFixed(2)}` : '';

  let vfFlag = '';
  if (isDesktop) {
    const zpFilter = scenarioResult.zoomKeyframes.length
      ? buildZoompanFilter(
          scenarioResult.zoomKeyframes,
          scenarioResult.trimStart,
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

  try {
    execSync(
      `ffmpeg -y ${ssFlag} -i "${webmPath}" ${vfFlag} -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stderr' in err) {
      const stderr = (err as { stderr: Buffer }).stderr;
      console.error(`FFmpeg failed for ${label}:\n${stderr.toString()}`);
    }
    throw err;
  }

  // Clean up temp dir
  execSync(`rm -rf "${videoDir}"`);

  console.log(`  ✓ ${label}.mp4`);
  return outputPath;
}
