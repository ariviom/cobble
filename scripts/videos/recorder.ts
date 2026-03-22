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
// Auth
// ---------------------------------------------------------------------------

/**
 * Delete all user-specific data from Supabase so every recording starts from
 * a clean slate (e.g. no sets already marked "owned").
 */
async function resetUserData(
  supabaseUrl: string,
  userId: string
): Promise<void> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.warn('  SUPABASE_SERVICE_ROLE_KEY not set, skipping data reset');
    return;
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const tables = ['user_set_parts', 'user_parts_inventory', 'user_sets'];
  await Promise.all(
    tables.map(table =>
      fetch(`${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers,
      })
    )
  );
}

/**
 * Sign in via Supabase GoTrue and inject the session cookie into the browser
 * context. Uses VIDEO_AUTH_EMAIL / VIDEO_AUTH_PASSWORD from env. Returns true
 * if authentication succeeded.
 */
async function authenticate(
  browserContext: import('playwright').BrowserContext,
  baseUrl: string
): Promise<boolean> {
  const email = process.env.VIDEO_AUTH_EMAIL;
  const password = process.env.VIDEO_AUTH_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!email || !password) return false;
  if (!supabaseUrl || !anonKey) {
    console.warn(
      '  VIDEO_AUTH creds set but NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing'
    );
    return false;
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    console.warn(`  Auth failed: ${res.status} ${res.statusText}`);
    return false;
  }

  const session = await res.json();

  // Reset all user data so every recording starts fresh
  await resetUserData(supabaseUrl, session.user.id);

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;

  // Chunk cookie if value exceeds browser limits (matching @supabase/ssr)
  const CHUNK_SIZE = 3180;
  const domain = new URL(baseUrl).hostname;
  const cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
  }> = [];

  if (encoded.length <= CHUNK_SIZE) {
    cookies.push({ name: cookieName, value: encoded, domain, path: '/' });
  } else {
    for (let i = 0; i * CHUNK_SIZE < encoded.length; i++) {
      cookies.push({
        name: `${cookieName}.${i}`,
        value: encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        domain,
        path: '/',
      });
    }
  }

  await browserContext.addCookies(cookies);
  return true;
}

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
  outputDir: string
): Promise<string> {
  const { viewport, theme, color } = variant;
  const label = `${scriptName}-${viewport}-${theme}-${color}`;
  const videoDir = join(outputDir, `video-${label}`);

  mkdirSync(videoDir, { recursive: true });

  const vp = VIEWPORTS[viewport];
  const isDesktop = viewport !== 'mobile';

  // ----- Browser & context -----
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader', // deterministic software GPU renderer
      '--enable-unsafe-swiftshader', // required in newer Chromium
    ],
  });
  const browserContext = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: viewport === 'mobile' ? 2 : 1,
    isMobile: viewport === 'mobile',
    hasTouch: viewport === 'mobile',
    recordVideo: { dir: videoDir, size: vp },
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

  // ----- Authenticate (if VIDEO_AUTH_EMAIL/PASSWORD are set) -----
  await authenticate(browserContext, baseUrl);

  const videoStartMs = Date.now();
  const page = await browserContext.newPage();

  // ----- API response cache -----
  // Normalize URLs so encoding differences (e.g. %20 vs +) between
  // response.url() and request.url() don't cause cache misses.
  function normalizeUrl(raw: string): string {
    try {
      const u = new URL(raw);
      u.searchParams.sort();
      return u.toString();
    } catch {
      return raw;
    }
  }

  const apiCache = new Map<
    string,
    { status: number; headers: Record<string, string>; body: Buffer }
  >();
  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      try {
        const body = await response.body();
        apiCache.set(normalizeUrl(response.url()), {
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

  // ----- Refresh cached responses (bypass CDN) -----
  // The warm-up populates apiCache via browser requests, which may receive
  // stale data from CDN/proxy caches. Re-fetch each URL with a cache-busting
  // query param so the CDN treats it as a new URL and hits the origin.
  for (const [url, prev] of apiCache) {
    try {
      const freshUrl = new URL(url);
      freshUrl.searchParams.set('_nocache', Date.now().toString());
      const res = await fetch(freshUrl.toString(), {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      const body = Buffer.from(await res.arrayBuffer());
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      apiCache.set(url, { status: res.status, headers, body });
      if (body.length !== prev.body.length) {
        console.log(
          `  Refreshed: ${url.split('?')[0]} ${prev.body.length}b → ${body.length}b`
        );
      }
    } catch (err) {
      console.log(`  Refresh failed: ${url.split('?')[0]} — ${err}`);
    }
  }

  // ----- Install API cache route -----
  for (const [url, data] of apiCache) {
    console.log(`  Cached: ${url} (${data.body.length}b)`);
  }
  await page.route('**/api/**', async (route, request) => {
    const key = normalizeUrl(request.url());
    const cached = apiCache.get(key);
    if (cached) {
      await route.fulfill(cached);
    } else {
      console.log(`  Cache MISS: ${key}`);
      await route.continue();
    }
  });

  // ----- Reload to clear TanStack Query in-memory cache -----
  // The warm-up may have populated TanStack Query with stale CDN data.
  // Reloading the page clears all in-memory JS state while the route
  // intercept (which persists across navigations) serves fresh apiCache data.
  await page.reload({ waitUntil: 'networkidle' });

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
