# Video Recording Pipeline Redesign

## Problem

The video recording pipeline works but is hard to modify. Timing values are scattered across 16+ hardcoded `waitForTimeout` calls, zoom targets use magic pixel constants, and there's no shared vocabulary across scenarios. Adding new scenarios means copy-pasting boilerplate and hoping nothing breaks. The loader flash on first search persists despite API caching because the warm-up destroys SPA state with a full page navigation.

The goal: make it easy to author short, looping marketing and tutorial videos across search, identify, collections, and other features — with timing tweaks requiring only config edits.

## Approach

Config-driven scenarios. Each scenario exports a typed config object (all timings, zoom levels, content parameters), a `warmUp` function, and a `run` function. A shared `ScenarioContext` provides helpers and computed viewport values so nothing is hardcoded. The recorder handles browser lifecycle, API caching, and FFmpeg post-processing.

## Scenario Interface

Every scenario file exports three things:

```ts
export const config: ScenarioConfig = {
  /* ... */
};
export function warmUp(ctx: ScenarioContext): Promise<void>;
export function run(ctx: ScenarioContext): Promise<ScenarioResult>;
```

### ScenarioConfig

```ts
interface ScenarioConfig {
  name: string;
  description: string;
  warmStart: boolean; // true = skip page.goto in run(), use warm SPA state

  timing: {
    initialPause: number;
    zoomTransition: number;
    panTransition: number;
    typingBase: [number, number]; // [min, max] ms per keystroke
    typingPauseChance: number; // probability of extra 200ms pause
    [key: string]: number | [number, number]; // scenario-specific timing keys
  };

  zoom: {
    searchInput: number; // e.g., 1.8
    modalFraming: number; // e.g., 1.25
    modalCenterOffset: number; // fraction of viewport height to shift modal center down
    [key: string]: number; // scenario-specific zoom levels
  };

  [key: string]: unknown; // scenario-specific content (set numbers, queries, etc.)
}
```

The `timing` and `zoom` objects use descriptive names so the purpose of each value is clear without reading choreography code. Scenario-specific keys (like `setNumber` for search-set) go at the top level.

### ScenarioContext

```ts
interface ScenarioContext {
  page: Page;
  baseUrl: string;
  config: ScenarioConfig;
  viewport: { width: number; height: number };
  viewportCenter: { x: number; y: number };

  // Helpers
  mark(zoom: number, center?: { x: number; y: number }): void;
  typeNaturally(text: string): Promise<void>;
  centerOf(locator: Locator): Promise<{ x: number; y: number }>;
  wait(ms: number): Promise<void>; // alias for page.waitForTimeout
}
```

Created by a `createContext()` factory in `context.ts`. The factory wires up `mark()` to record zoom keyframes with timestamps, `typeNaturally()` to use the config's typing speed values, and computes `viewport` and `viewportCenter` from the Playwright page.

### ScenarioResult

```ts
interface ScenarioResult {
  trimStart: number;
  zoomKeyframes: ZoomKeyframe[];
}
```

A proper typed return. No more manual `'trimStart' in scenarioResult` checks.

## Warm-Start Mechanism

Solves two problems: API response caching and eliminating the brick loader flash.

### Flow

1. `recorder.ts` creates browser context + page with `addInitScript` for theme/onboarding.
2. Attaches `page.on('response')` listener to capture API responses.
3. Calls `scenario.warmUp(ctx)`:
   - Navigates to the starting page.
   - Performs all searches/interactions that `run()` will do.
   - Populates browser cache (images, CSS, JS) and SPA cache (TanStack Query).
   - Ends with page in a clean starting state (search cleared, no modals).
4. Installs `page.route('**/api/**')` to intercept API calls with cached responses.
5. Calls `scenario.run(ctx)`:
   - When `warmStart: true`: does NOT call `page.goto()`. The page is already loaded with warm SPA state. TanStack Query finds cached data, renders results synchronously — no loading state.
   - When `warmStart: false`: calls `page.goto()` for a fresh page load. The loader may flash briefly, which is appropriate for tutorial videos showing real app behavior.

### warmUp Contract

- Navigate to the starting page.
- Perform all interactions that `run()` will perform (to populate both browser cache and TanStack Query cache).
- End with the page in a clean starting state.
- Return nothing — side-effect-only function.

### API Cache Stays in recorder.ts

The `page.on('response')` capture and `page.route()` interception are generic infrastructure. The scenario's `warmUp` just performs interactions; it doesn't know about caching.

## File Structure

### Current

```
scripts/videos/
  record.ts          # 356 lines — CLI, browser, caching, FFmpeg, concurrency
  zoom.ts            # 128 lines — zoompan filter builder
  save-auth.ts       # 50 lines — auth state saver
  scenarios/
    search-set.ts    # 162 lines — one scenario
```

### Proposed

```
scripts/videos/
  record.ts          # CLI parsing, variant matrix, concurrency, main()
  recorder.ts        # recordVariant(): browser setup, warm-up, API cache, FFmpeg
  zoom.ts            # zoompan filter builder (unchanged)
  context.ts         # ScenarioConfig, ScenarioContext, ScenarioResult types + createContext()
  helpers.ts         # typeNaturally, centerOf, shared interaction primitives
  save-auth.ts       # unchanged
  scenarios/
    search-set.ts    # refactored: exports config, warmUp, run
```

### Responsibilities

**record.ts** (~100 lines): CLI parsing with `--viewport`, `--theme`, `--color`, `--url`, `--serial`, `--storage-state`, `--list` flags. Builds variant matrix. Validates scenario exists. Orchestrates parallel recording via `mapWithConcurrency`. Auto-cleans previous outputs. Scenario discovery via `--list` (scans `scenarios/` directory).

**recorder.ts** (~200 lines): `recordVariant()` function. Launches browser, creates context with `addInitScript` for theme/color/onboarding injection. Attaches API response capture. Calls `warmUp`. Installs API route interception. Calls `run`. Saves video. Computes trim. Builds FFmpeg filter (zoom for desktop, passthrough for mobile). Runs FFmpeg. Cleans temp files. Logs FFmpeg stderr on failure.

**context.ts** (~80 lines): Type definitions for `ScenarioConfig`, `ScenarioContext`, `ScenarioResult`. Re-exports `ZoomKeyframe` from `zoom.ts`. `createContext(page, baseUrl, config)` factory that wires up helpers and computes viewport values.

**helpers.ts** (~50 lines): `typeNaturally(page, text, config.timing)`, `centerOf(locator)`. Pure functions that take explicit arguments — no global state. New interaction helpers (scroll, drag, long-press) go here as scenarios need them.

## Viewport Handling

No magic pixel constants. Everything computed from the viewport.

```ts
// In createContext()
ctx.viewport = { width: vp.width, height: vp.height };
ctx.viewportCenter = { x: vp.width / 2, y: vp.height / 2 };

// In scenario run()
const modalCenter = {
  x: ctx.viewport.width / 2,
  y: ctx.viewport.height * (0.5 + ctx.config.zoom.modalCenterOffset),
};
```

### Mobile

- Mobile scenarios use the same `config` + `run()` pattern.
- `mark()` calls are recorded but the zoom filter is only applied for desktop (existing behavior).
- No separate mobile scenarios needed — a single scenario works for both viewports. Timing config applies equally. Zoom marks are a no-op on mobile.
- Scenarios can check `ctx.viewport.width` if they need different choreography (different selectors, tap vs click).

## FFmpeg Pipeline

No changes to the zoom algorithm. `zoom.ts` with effective centers, smoothstep interpolation, and the zoompan filter builder stays as-is.

Changes in `recorder.ts`:

- Reads `zoomKeyframes` from the typed `ScenarioResult` instead of manual property checking.
- Logs the FFmpeg command and stderr on failure for diagnostics.

## What Stays the Same

- `zoom.ts` — the effective-center algorithm and smoothstep expression builder.
- `save-auth.ts` — auth state capture utility.
- The FFmpeg zoompan post-processing approach.
- Variant matrix (viewport x theme x color).
- Parallel recording with staggered workers.
- Auto-trim of page load via FFmpeg `-ss`.
- Auto-clean of previous outputs.

## Example: Refactored search-set.ts

```ts
import type { ScenarioConfig, ScenarioContext, ScenarioResult } from '../context';

export const config: ScenarioConfig = {
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

export async function warmUp(ctx: ScenarioContext) {
  const { page, baseUrl, config: c } = ctx;
  const searchInput = page.getByLabel('Search sets');
  const resultCard = page.locator('[data-video-target="set-card"]');

  await page.goto(`${baseUrl}/search`);
  await page.waitForLoadState('networkidle');

  // Search by number — caches API response and images
  await searchInput.fill(c.setNumber as string);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Grab set name and search by that too
  const setName = (await page.locator('[data-video-target="set-card-name"]').first().textContent()) ?? 'Galaxy Explorer';
  await page.getByLabel('Clear search').click();
  await searchInput.fill(setName);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Open modal to cache its data
  await resultCard.first().click();
  await page.waitForTimeout(1500);
  await page.getByLabel('Close').click().catch(() => {});

  // Clean up to starting state
  await page.getByLabel('Clear search').click().catch(() => {});
  await page.waitForTimeout(500);
}

export async function run(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { page, baseUrl, config: c, mark, wait, typeNaturally, centerOf } = ctx;
  const t = c.timing;

  // --- Page load (only when not warm-started) ---
  if (!c.warmStart) {
    await page.goto(`${baseUrl}/search`);
    await page.waitForLoadState('networkidle');
  }
  await wait(200);
  const trimStart = /* computed from ctx timestamps */;

  mark(1);
  await wait(t.initialPause);

  const searchInput = page.getByLabel('Search sets');
  const resultCard = page.locator('[data-video-target="set-card"]');

  // Zoom into search area
  const searchCenter = await centerOf(searchInput);
  mark(1);
  await wait(t.zoomTransition);
  mark(c.zoom.searchInput, searchCenter);

  await searchInput.click();
  await typeNaturally(c.setNumber as string);
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await resultCard.first().waitFor({ state: 'visible', timeout: 15000 });
  await wait(t.dwellOnResults);

  // ... rest of choreography using t.* and c.zoom.* values ...
}
```

Every timing value reads from `t.*`, every zoom level from `c.zoom.*`. Tweaking any value means changing one number in the config object at the top of the file.
