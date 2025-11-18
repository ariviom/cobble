## Identify flow — implementation notes (current)

This document captures the *implemented* behavior of the Identify tab and backend. It reflects the newer BrickLink-supersets fallback and supersedes older assembly-component behavior described in `identify-feature.md`.

### High-level flow

1. **Image upload (client)**
   - `app/identify/page.tsx`:
     - Lets the user select or capture one image.
     - Sends `POST /api/identify` with multipart form data (`image` field).
     - Renders:
       - The identified part card (`IdentifyResultCard`).
       - A color dropdown (from either Rebrickable or BrickLink, depending on path).
       - A grid of sets (`IdentifySetList`) for the selected part/color.

2. **Brickognize → candidates**
   - `app/lib/brickognize.ts`:
     - `identifyWithBrickognize(image)` calls `https://api.brickognize.com/predict/parts/` (overrideable via `BRICKOGNIZE_ENDPOINT`).
     - `extractCandidatePartNumbers` normalizes the response into:
       - `partNum`, `confidence`, `imageUrl`, and `bricklinkId` (parsed from `external_sites[]` URLs with `P=` query parameter when present).

3. **Rebrickable (RB) path — single parts**
   - `app/lib/rebrickable.ts`:
     - `resolvePartIdToRebrickable(id, { bricklinkId })`:
       - Prefers RB `/lego/parts/?bricklink_id=...`.
       - Falls back to direct `/lego/parts/{id}/` and finally `searchParts`.
     - `getPartColorsForPart(partNum)`:
       - Lists colors in which the part appears (normalized to `PartAvailableColor[]`).
     - `getSetsForPart(partNum, colorId?)`:
       - Handles both color-scoped and unscoped RB endpoints.
       - Includes 1h in-memory caching keyed by `partNum::colorId`.
   - `app/api/identify/route.ts` RB flow:
     - Resolves Brickognize candidates to RB parts.
     - For each RB part in descending confidence order:
       - Fetches RB colors, auto-selects if exactly one, or uses `colorHint`/candidate color when provided.
       - Calls `getSetsForPart(partNum, selectedColorId)` and accepts the first candidate that yields sets.
     - Response (RB-success path):
       - `part: { partNum, name, imageUrl, confidence, colorId, colorName }`
       - `candidates: IdentifyCandidate[]` (up to 5 RB-resolved candidates)
       - `availableColors: { id, name }[]` (RB)
       - `selectedColorId`
       - `sets: IdentifySet[]` (RB sets, sorted by quantity desc, then year desc)

4. **BrickLink (BL) path — assemblies / RB miss**
   - `app/lib/bricklink.ts`:
     - OAuth 1.0a signed client against `https://api.bricklink.com/api/store/v1`.
     - `blGetPart(no)` → `/items/PART/{no}` (catalog item).
     - `blGetPartColors(no)` → `/items/PART/{no}/colors`:
       - Returns known colors; normalized to `{ color_id, color_name? }[]`.
     - `blGetPartSubsets(no, colorId?)` → `/items/PART/{no}/subsets`:
       - BrickLink returns an array of groups `{ match_no, entries: [...] }`; implementation flattens all entries into `BLSubsetItem[]`.
     - `blGetPartSupersets(no, colorId?)` → `/items/PART/{no}/supersets`:
       - BrickLink returns an array of groups `{ color_id?, entries: [...] }`. The code:
         - Flattens all group `entries`.
         - Normalizes each entry to:
           - `BLSupersetItem = { setNumber, name, imageUrl, quantity }`.
   - `app/api/identify/route.ts` BL fallback (no RB-resolved candidates):
     - If no RB candidates resolve and at least one Brickognize candidate has `bricklinkId`:
       - Uses that BL id (e.g., `6129c03`) for fallback.
       - Attempts BL supersets:
         1. `blGetPartSupersets(blId)` (unscoped).
         2. If empty, `blGetPartColors(blId)` then per-color `blGetPartSupersets(blId, color_id)`.
         3. If still empty, optionally uses subsets for color inference.
       - Fetches BL part meta via `blGetPart(blId)` for name + image.
       - Builds:
         - `part` from Brickognize (and/or BL meta).
         - `blAvailableColors` from `blGetPartColors`.
         - `sets` from normalized `BLSupersetItem[]`.
       - Response (BL-first path, RB miss):
         - `part`
         - `blPartId`
         - `blAvailableColors`
         - `candidates: []`
         - `availableColors: []`
         - `selectedColorId: null`
         - `sets` from BrickLink supersets.
   - `app/api/identify/route.ts` BL fallback (RB candidates but no sets):
     - If RB resolved candidates but none produced sets:
       - Reuses the same BL supersets logic as above for the best BL-backed candidate.
       - Responds with:
         - `part` (RB-resolved part where possible).
         - `blPartId`, `blAvailableColors`.
         - RB `candidates` list.
         - `sets` from BL.

5. **BL supersets-for-color endpoint (used by UI color dropdown)**
   - `app/api/identify/bl-supersets/route.ts`:
     - `GET /api/identify/bl-supersets?part={blPartId}&blColorId={id?}`.
     - Calls `blGetPartSupersets(blPartId, blColorId)`.
     - Returns:
       - `{ sets: IdentifySet[] }` derived from `BLSupersetItem[]` (RB-style shape).

6. **Client behavior with BL assemblies (e.g., 6129c03)**
   - `app/identify/page.tsx`:
     - On initial `/api/identify` response:
       - If `blPartId` + `blAvailableColors` are present:
         - Uses `blAvailableColors` as the color dropdown options.
         - Initial `sets` come from the identify response.
     - On color change while `blPartId` is set:
       - Calls `/api/identify/bl-supersets?part={blPartId}&blColorId={colorId}`.
       - Replaces `sets` with the BL-supersets result.
   - For the classic green dragon (`6129c03`, color id 6):
     - Brickognize identifies the BL part ID.
     - BL supersets (with `color_id=6`) return the four sets containing the assembly.
     - The Identify page shows the dragon card plus those four sets; no component-part list is rendered.

### Notable differences vs original identify spec

- The original `identify-feature.md` described an “assembly” path that:
  - Returned a component list (`assembly` array) to the client.
  - Required the user to pick a component before fetching RB colors + sets.
- The **current implementation**:
  - Does **not** return or render an `assembly` component list.
  - Uses BrickLink supersets as the primary assembly fallback:
    - If RB cannot provide sets, BL supersets are used to provide the set list directly.
  - Keeps Rebrickable as the canonical source for single-part cases; BrickLink is only used as a parts-in-set provider when RB cannot handle assemblies directly.


