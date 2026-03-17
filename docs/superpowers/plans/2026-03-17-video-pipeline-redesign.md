# Video Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the video recording pipeline so scenarios are config-driven with typed interfaces, warm-start eliminates the loader flash, and all timing/zoom values are easily tweakable from a config object at the top of each scenario file.

**Architecture:** Extract recording logic from the monolithic `record.ts` into `recorder.ts` (browser lifecycle, API cache, FFmpeg) and `context.ts` (types, factory). Scenarios export `config`, `warmUp`, and `run`. Shared helpers (`typeNaturally`, `centerOf`) move to `helpers.ts`. `zoom.ts` unchanged.

**Tech Stack:** TypeScript, Playwright, FFmpeg (zoompan filter), tsx runner

**Spec:** `docs/superpowers/specs/2026-03-17-video-pipeline-redesign.md`

---

## File Map

| File                                     | Action    | Responsibility                                                                                                                   |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/videos/context.ts`              | Create    | Types (`BaseTiming`, `BaseZoom`, `ScenarioConfig`, `ScenarioContext`, `RunResult`, `ScenarioResult`) + `createContext()` factory |
| `scripts/videos/helpers.ts`              | Create    | `typeNaturally()`, `centerOf()` — pure functions taking explicit args                                                            |
| `scripts/videos/recorder.ts`             | Create    | `recordVariant()` — browser setup, warm-up orchestration, API cache, FFmpeg post-processing                                      |
| `scripts/videos/record.ts`               | Rewrite   | CLI parsing, variant matrix, `--list`, concurrency orchestration, `main()`                                                       |
| `scripts/videos/scenarios/search-set.ts` | Rewrite   | Exports `config`, `warmUp`, `run` using context + config pattern                                                                 |
| `scripts/videos/zoom.ts`                 | Unchanged | Re-exported from `context.ts`                                                                                                    |
| `scripts/videos/save-auth.ts`            | Unchanged | —                                                                                                                                |

---

## Chunk 1: Foundation — Types, Context Factory, Helpers

### Task 1: Create `context.ts` with types and `createContext()`

**Files:**

- Create: `scripts/videos/context.ts`

- [ ] **Step 1: Create context.ts**

Key design decisions in the code:

- `RunResult` (what `run()` returns) has just `trimStart`. `ScenarioResult` (used by recorder for FFmpeg) adds `zoomKeyframes` — assembled by `recorder.ts` from the keyframes array it owns.
- `createContext()` takes a `zoomKeyframes` array by reference. For warmUp, pass a throwaway array (no-op marks). For run, pass the real array the recorder will use.
- `elapsed()` measures from `t0` captured at context creation — used by scenarios for `trimStart`.
- `viewport` and `viewportCenter` computed from `page.viewportSize()`.
- Helpers are bound to the page and config so scenarios destructure them cleanly: `const { mark, wait, typeNaturally, centerOf } = ctx`.

Types use generics so scenario-specific configs get full type safety: `ScenarioContext<SearchSetConfig>` gives `ctx.config.setNumber` as `string`, `ctx.config.timing.dwellOnResults` as `number`.

- [ ] **Step 2: Verify it compiles (will fail until helpers.ts exists — expected)**

Run: `npx tsc --noEmit 2>&1 | grep context.ts || echo "no errors from context.ts"`

- [ ] **Step 3: Commit**

```
git add scripts/videos/context.ts
git commit -m "feat(videos): add context.ts with types and createContext factory"
```

---

### Task 2: Create `helpers.ts`

**Files:**

- Create: `scripts/videos/helpers.ts`

- [ ] **Step 1: Create helpers.ts**

Two pure functions:

- `typeNaturally(page, text, timing)` — reads `typingBase` [min, max] and `typingPauseChance` from the timing config. No hardcoded delay values.
- `centerOf(locator)` — returns `{ x, y }` center of a Playwright locator's bounding box.

Both take explicit arguments (no global state, no context dependency). The `createContext()` factory binds them to the page/config.

- [ ] **Step 2: Verify both files compile**

Run: `npx tsc --noEmit`

Focus on errors from `scripts/videos/context.ts` and `scripts/videos/helpers.ts` only.

- [ ] **Step 3: Commit**

```
git add scripts/videos/helpers.ts
git commit -m "feat(videos): add helpers.ts with typeNaturally and centerOf"
```

---

## Chunk 2: Recorder Extraction

### Task 3: Create `recorder.ts`

Extract `recordVariant()` from `record.ts` into its own file with the warm-up orchestration and context isolation.

**Files:**

- Create: `scripts/videos/recorder.ts`
- Reference (read only): `scripts/videos/record.ts` (current monolith)

- [ ] **Step 1: Create recorder.ts**

Key responsibilities and design decisions:

**Exports:** `recordVariant()`, `VIEWPORTS`, `Viewport`, `Variant`, `ScenarioModule` types.

**`ScenarioModule` interface** — the shape a scenario file must export:

```ts
interface ScenarioModule {
  config: ScenarioConfig;
  warmUp(ctx: ScenarioContext): Promise<void>;
  run(ctx: ScenarioContext): Promise<RunResult>;
}
```

**`recordVariant()` flow:**

1. Launch browser, create context with `addInitScript` (theme/color/onboarding).
2. Create page. Attach `page.on('response')` to capture API responses into a `Map`.
3. Create warmUp context with throwaway keyframes array. Call `scenario.warmUp(warmUpCtx)` wrapped in `.catch(() => {})`.
4. Install `page.route('**/api/**')` to serve cached API responses.
5. Create run context with real keyframes array. Capture `scenarioStartMs`. Call `scenario.run(runCtx)`.
6. Assemble `ScenarioResult`: `{ trimStart: runResult.trimStart, zoomKeyframes: realKeyframes }`.
7. Close page, save video, close browser.
8. Compute FFmpeg trim: `preScenarioSec + scenarioResult.trimStart`.
9. Build zoom filter for desktop (skip for mobile). Call `buildZoompanFilter()` from `zoom.ts`.
10. Run FFmpeg. On failure, log stderr before rethrowing.
11. Clean up temp directory. Print success.

**FFmpeg error handling:** Wrap `execSync` in try/catch. On failure, extract `stderr` from the error object and log it before rethrowing. This replaces the current silent failure.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
git add scripts/videos/recorder.ts
git commit -m "feat(videos): add recorder.ts with recordVariant and warm-up orchestration"
```

---

### Task 4: Rewrite `record.ts` as slim CLI

**Files:**

- Rewrite: `scripts/videos/record.ts`

- [ ] **Step 1: Rewrite record.ts**

What stays: CLI parsing (`parseArgs`), `mapWithConcurrency`, `main()`, variant matrix building, output cleanup.

What moves out: `recordVariant` (now in `recorder.ts`), `VIEWPORTS`, `Variant`, zoom import, all browser/FFmpeg logic.

What's new:

- `--list` flag: calls `listScenarios()` which scans `scenarios/` for `.ts` files, dynamically imports each, reads `config.name` and `config.description`, prints `name — description` to stdout, then exits.
- `loadScenario(name)`: validates the scenario exports `config`, `warmUp`, and `run`. Prints a clear error if not.
- `parseArgs()` returns a discriminated union: `{ list: true }` or `{ list: false, scriptName, variants, ... }`.
- `main()` passes the loaded `ScenarioModule` (not just `scenario.run`) to `recordVariant`.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
git add scripts/videos/record.ts
git commit -m "refactor(videos): slim record.ts to CLI + orchestration with --list"
```

---

## Chunk 3: Scenario Refactor + Verification

### Task 5: Rewrite `search-set.ts` with config + warmUp + run

**Files:**

- Rewrite: `scripts/videos/scenarios/search-set.ts`

- [ ] **Step 1: Rewrite search-set.ts**

Structure:

1. **Type definitions** at the top: `SearchSetTiming extends BaseTiming`, `SearchSetZoom extends BaseZoom`, `SearchSetConfig extends ScenarioConfig<SearchSetTiming, SearchSetZoom>`.
2. **`config` export**: all timing/zoom/content values. This is the "control panel" — tweak any value here without touching choreography code.
3. **`warmUp` export**: navigates to `/search`, searches by set number, grabs set name, searches by name, opens modal, cleans up. Uses `ctx.wait()` consistently. No `mark()` calls (warmUp context has no-op mark anyway).
4. **`run` export**: the choreography. All timing reads from `t.*` (destructured from `c.timing`), all zoom levels from `z.*` (from `c.zoom`). Modal center computed from `viewport` + `z.modalCenterOffset` — no hardcoded pixel values. Returns `{ trimStart }`.

Key differences from current code:

- `MODAL_CENTER` replaced with computed `modalCenter` from viewport.
- All 16+ `waitForTimeout` calls replaced with `wait(t.namedValue)`.
- `typeNaturally` is now `ctx.typeNaturally` which reads typing speed from config.
- `'10497'` replaced with `c.setNumber`.
- `mark(1.8, ...)` replaced with `mark(z.searchInput, ...)`.
- Return is `{ trimStart }` not `{ trimStart, zoomKeyframes }` — recorder assembles the full result.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
git add scripts/videos/scenarios/search-set.ts
git commit -m "refactor(videos): rewrite search-set scenario with config-driven timing and zoom"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Single desktop recording**

```bash
npx tsx scripts/videos/record.ts search-set --url https://brick-party.com --viewport desktop --theme light --color yellow
```

Expected: Warm-up runs silently, recording completes, output is `search-set-desktop-light-yellow.mp4` with zoom effects.

- [ ] **Step 2: Test --list flag**

```bash
npx tsx scripts/videos/record.ts --list
```

Expected: `search-set — Search by set number, mark owned, search by name`

- [ ] **Step 3: Test mobile variant**

```bash
npx tsx scripts/videos/record.ts search-set --url https://brick-party.com --viewport mobile --theme dark --color purple
```

Expected: Recording completes, no zoom filter applied.

- [ ] **Step 4: Test parallel multi-variant**

```bash
npx tsx scripts/videos/record.ts search-set --url https://brick-party.com --viewport all --theme light --color yellow
```

Expected: 2 videos (desktop + mobile), both successful.

- [ ] **Step 5: Review video quality**

Open `scripts/videos/output/search-set-desktop-light-yellow.mp4`. Verify:

- Zoom into search input is straight (no arc)
- Pan to result card is diagonal
- Modal framing is ~5% below viewport center
- No loader flash on first search (warm-start)
- All transitions use ease-in-out timing

- [ ] **Step 6: Final commit**

```
git add -A scripts/videos/
git commit -m "feat(videos): complete pipeline redesign — config-driven scenarios with warm-start"
```

---

## Summary

| Task | What                          | Files                     | ~Minutes |
| ---- | ----------------------------- | ------------------------- | -------- |
| 1    | Types + createContext factory | `context.ts`              | 5        |
| 2    | Shared helpers                | `helpers.ts`              | 3        |
| 3    | Extract recordVariant         | `recorder.ts`             | 10       |
| 4    | Slim CLI + --list             | `record.ts` (rewrite)     | 5        |
| 5    | Config-driven scenario        | `search-set.ts` (rewrite) | 10       |
| 6    | End-to-end verification       | Run commands              | 10       |

Unchanged: `zoom.ts`, `save-auth.ts`.
