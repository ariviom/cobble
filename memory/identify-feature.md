# Identify Tab — Feature Notes

## What we implemented (current)

- Brickognize integration (visual-only)
  - Calls legacy predict endpoints: `POST https://api.brickognize.com/predict/parts/` (fallback to `/predict/`).
  - Sends multipart with a single `query_image` field and `accept: application/json`.
  - Parses response `items[]` (`id`, `name`, `img_url`, `score`, `external_sites[]`) into candidates.
  - Dev-only logging added to inspect raw responses and non-200 cases.
  - Endpoint can be overridden with `BRICKOGNIZE_ENDPOINT`.

- BrickLink integration (OAuth 1.0a)
  - `app/lib/bricklink.ts`: signed GET client using env:
    - `BRICKLINK_CONSUMER_KEY`, `BRICKLINK_CONSUMER_SECRET`, `BRICKLINK_TOKEN_VALUE`, `BRICKLINK_TOKEN_SECRET` (fallback for `BRICLINK_TOKEN_SECRET`).
  - `blGetPart(no)`: GET `/items/part/{no}`.
  - `blGetPartSubsets(no, colorId?)`: GET `/items/part/{no}/subsets` → component parts for assemblies.
  - Used to detect assemblies early and surface component list to the UI.

- Rebrickable integration
  - `getPart(partNum)`: `GET /lego/parts/{part}/?inc_part_details=1` (ensures `print_of` presence).
  - `getPartColorsForPart(partNum)`: `GET /lego/parts/{part}/colors/` (handles nested color or top-level color_id shapes; dev logs sample).
  - `getSetsForPart(partNum, colorId?)`:
    - Color-scoped: `GET /lego/parts/{part}/colors/{color_id}/sets/` (top-level set fields).
    - Uncolored: `GET /lego/parts/{part}/sets/` (nested `set`).
    - Paginates via `next`; maps both shapes; dev logs pages.
    - Fallbacks: try uncolored → follow `print_of` (base mold) → try sole available color when exactly one exists.
  - `searchParts(query)`: `GET /lego/parts/?search=...` (last resort).
  - `resolvePartIdToRebrickable(id, { bricklinkId? })`:
    - Direct `/parts/{id}` → RB `bricklink_id` filter → search fallback. 24h in-memory cache.
  - `mapBrickLinkColorIdToRebrickableColorId(blColorId)`: map BL color to RB color via `/lego/colors/` external_ids.

- Identify API
  - `POST /api/identify`
    - Accepts `image`.
    - Brickognize → candidates (extract BL id from field or external_sites URL `P=` param).
    - EARLY assembly path: if top BL candidate has subsets, return `assembly` list immediately (no 422).
    - Otherwise resolve to RB via `resolvePartIdToRebrickable` (prefer BL→RB filter).
    - Fetch RB `availableColors`; auto-select when single; fetch sets (color-scoped first).
    - Returns: `{ part, candidates, sets, availableColors, selectedColorId, assembly? }`.
  - `GET /api/identify/sets?part=...&colorId=...&blColorId=...`
    - Resolves BL part→RB when needed, maps BL color→RB, returns `{ part, sets, availableColors, selectedColorId }`.

- UI
  - `app/identify/page.tsx`:
    - Large square upload tile (camera icon). Clicking opens native file/camera picker.
    - After selecting an image: preview appears and a “Search” button triggers identification.
    - Shows identified piece card, candidate chips (for disambiguation), and color dropdown (optional filter).
    - Clicking a set opens the Set tab.
  - Components:
    - `IdentifyResultCard.tsx`: piece card + candidate chips + optional color dropdown.
    - `IdentifySetList.tsx` and `IdentifySetListItem.tsx`: grid of sets with quantity and year.

## Why this design (updated)

- Visual-only per requirements (no OCR, no Bing).
- Brickognize returns BL-centric IDs and assemblies. BrickLink provides deterministic ID resolution and assembly decomposition. Rebrickable remains the source for per-part colors and sets, keeping exports/inventories consistent.
- Color is auto-managed: single RB color → auto-select; multiple → per-part list only.

## End-to-end flow (current)

1. Image → Brickognize → candidates (BL links parsed when present).
2. If top BL candidate is an assembly → BrickLink subsets → return `assembly` list (UI shows components).
3. Otherwise resolve to Rebrickable part (prefer BL→RB mapping).
4. Per-part RB colors → auto-select single color if present.
5. Fetch sets with color-scoped RB endpoint; fallback to uncolored; fallback to `print_of`.
6. Return `{ part, candidates, sets, availableColors, selectedColorId, assembly? }`.

## Current issues and gaps

- Intermittent 422 on `/api/identify` for BL-only candidates (e.g., `6129c03`, `6129c04`):
  - Early-assembly path requires BrickLink OAuth to succeed; if BL subsets call fails (auth/misconfig/rate limit), we might return 422 instead of `assembly`.
  - Action: add explicit dev logging around BL OAuth/meta errors; degrade to `{ assembly: [] }` with a helpful message instead of 422.

- Candidate resolution robustness:
  - Prefer RB `bricklink_id` mapping; keep `searchParts` only as last resort.
  - Ensure we never 422 when we can at least return `assembly`.

- JSON parse error on `/identify` page (Unexpected end of JSON input):
  - Ensure all error paths return JSON with `{ error }` to avoid client parse failures.

## Goals / acceptance (updated)

- Printed part with single color (e.g., `2336pr0003`, red=4) returns 3 sets via RB color-scoped endpoint; dropdown hidden (auto-selected).
- BL assembly (e.g., `6129c03`) immediately returns `assembly` list; selecting a component triggers RB colors + sets and renders results.
- No 422s for assembly cases; dev logs for Brickognize, RB colors/sets, assembly detection, and identify/sets resolution.

## Action items

1. Reliability
   - Add explicit dev logs around BrickLink OAuth/meta (code/message) and subsets failures.
   - Never return 422 for BL-identified assemblies; always return `{ assembly }` payload even if RB mapping fails.
   - Ensure all error paths return JSON `{ error }` (avoid client parse errors).

2. Deterministic color handling
   - Keep per-part RB colors only; auto-select single.
   - When component comes with BL color, map BL→RB and preselect.

3. Data path clarity
   - Brickognize → BrickLink (ID + optional assembly) → Rebrickable (colors + sets).
   - Prefer RB `bricklink_id` filter; fallback to RB search when no BL signal.

4. Future
   - Optional: BrickLink supersets for immediate BL sets; standardize UI on RB sets.
   - Cache per-part colors and per part/color RB sets (1h).

- Caching and performance
  - Add caching for `partNum → sets` (e.g., 1h) to reduce Rebrickable calls when switching colors/candidates.
  - Rate-limit backoff and minimal telemetry for failures (dev only for now).

- UX polish
  - Progress sub-states (e.g., “Identifying…”, “Finding sets…”).
  - Improve candidate chips (thumbnails, names).
  - Optional color auto-guess (heuristic via image sampling) as a ranking hint only.

- Testing
  - Unit tests for resolver heuristics and Rebrickable search fallback.
  - Integration tests for `/api/identify` success/degenerate paths (mock providers).

## Files and modules (current)

- `app/lib/brickognize.ts` — HTTP client, response parsing, dev logging.
- `app/lib/rebrickable.ts` — parts/colors/sets, BL→RB mapping, resolver, dev logs.
- `app/lib/bricklink.ts` — OAuth client (getPart, getPartSubsets).
- `app/api/identify/route.ts` — Brickognize → EARLY BL assembly → RB colors/sets; structured response.
- `app/api/identify/sets/route.ts` — sets for selected part; accepts `blColorId`; RB mapping/logging.
- `app/api/colors/route.ts` — simple colors list for dropdown.
- `app/identify/page.tsx` — upload tile, preview, search, results.
- `app/components/identify/*` — result card, sets list, assembly list components.


