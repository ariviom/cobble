# Identify Tab — Feature Notes

## What we implemented

- Brickognize integration (visual-only)
  - Calls legacy predict endpoints: `POST https://api.brickognize.com/predict/parts/` (fallback to `/predict/`).
  - Sends multipart with a single `query_image` field and `accept: application/json`.
  - Parses response `items[]` (`id`, `name`, `img_url`, `score`, `external_sites[]`) into candidates.
  - Dev-only logging added to inspect raw responses and non-200 cases.
  - Endpoint can be overridden with `BRICKOGNIZE_ENDPOINT`.

- Rebrickable integration
  - `getPart(partNum)`: fetch part meta (name, image).
  - `getSetsForPart(partNum, colorId?)`: fetches all pages, returns `{ setNumber, name, year, imageUrl, quantity }` and sorts by quantity desc, then year desc.
  - `searchParts(query)`: Rebrickable `/lego/parts/?search=` for resolving ambiguous or BrickLink-style ids.
  - Resolver `resolvePartIdToRebrickable`:
    - Try `getPart(partId)`; on failure, `searchParts(partId)` with heuristics (exact case-insensitive match → startsWith → first result).
    - In-memory cache (24h) to reduce repeat lookups.

- Identify API
  - `POST /api/identify`
    - Accepts multipart `image` from the UI.
    - Calls Brickognize and extracts candidates (score/confidence, id).
    - Resolves each candidate id to Rebrickable via the resolver.
    - Finds sets for candidates without forcing a color filter (tries preferred color if present, otherwise no color). Picks the first candidate that returns sets. Falls back to the first candidate if none have sets.
    - Returns: selected part, top candidates, and sets (sorted).
    - Tolerant error handling: never 500 on Rebrickable 404; degrade with empty sets.
  - `GET /api/identify/sets?part=...&colorId=...`
    - Fetches sets for a selected candidate; retries without color on 404; returns 200 with empty sets on failure.
  - `GET /api/colors` returns `{ id, name }` list (derived from Rebrickable colors, cached server-side).

- UI
  - `app/identify/page.tsx`:
    - Large square upload tile (camera icon). Clicking opens native file/camera picker.
    - After selecting an image: preview appears and a “Search” button triggers identification.
    - Shows identified piece card, candidate chips (for disambiguation), and color dropdown (optional filter).
    - Clicking a set opens the Set tab.
  - Components:
    - `IdentifyResultCard.tsx`: piece card + candidate chips + optional color dropdown.
    - `IdentifySetList.tsx` and `IdentifySetListItem.tsx`: grid of sets with quantity and year.

## Why this design

- Visual-only per requirements (no OCR, no Bing).
- Brickognize gives fast, LEGO-specific identification; Rebrickable remains authoritative for parts and sets.
- Resolver avoids BrickLink API/OAuth and keeps logic inside our existing server-only Rebrickable flow.
- Not gated by color to avoid missing sets; color can refine but never block results.

## Known behaviors

- If Brickognize returns BrickLink-style IDs (e.g., `2336p68`), resolver maps them via Rebrickable search.
- If color-filtered `getSetsForPart` 404s or returns empty, we try without color to include all colors.
- If no candidate returns sets, we still return the identified part and candidates with an empty sets array.

## Difficulties encountered

- Brickognize endpoint discovery
  - Initial 404s due to path mismatch; corrected to legacy `/predict/parts/` and ensured field name is `query_image` only.
  - Added dev logging for status and response previews to validate payloads.

- Candidate resolution
  - Brickognize often returns BrickLink-formatted `id`s that don’t resolve directly in Rebrickable `/parts/{id}`.
  - Implemented `resolvePartIdToRebrickable` (direct fetch → search fallback with heuristics and 24h cache).

- Rebrickable 404 on color-filtered sets
  - Some parts don’t have sets for a specific `color_id`; retrying without color resolves this.
  - We now avoid blocking on color altogether and only filter by color when explicitly useful.

## Next steps

- Quality and ranking
  - Add confidence/score normalization for candidate ranking.
  - Use Brickognize `external_sites` BrickLink URL `P=` param as an additional hint to resolver if search is ambiguous.

- Mold/print family (optional, behind a toggle)
  - Expand results to include related prints/unprinted mold equivalents and union their sets. De-duplicate and re-sort.

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

## Files and modules added/edited (high-level)

- `app/lib/brickognize.ts` — HTTP client, response parsing, dev logging.
- `app/lib/rebrickable.ts` — `getPart`, `searchParts`, `getSetsForPart`, `resolvePartIdToRebrickable` (with cache).
- `app/api/identify/route.ts` — orchestration, tolerant sets fetching, candidate loop.
- `app/api/identify/sets/route.ts` — sets-only endpoint for candidate/color changes.
- `app/api/colors/route.ts` — simple colors list for dropdown.
- `app/identify/page.tsx` — upload tile, preview, search, results.
- `app/components/identify/*` — result card and sets list components.


