# Set Overview Pages

## Goal

Create standalone set overview pages at `/sets/[setNumber]` for SEO, sharing, and discovery. These pages complement the existing inventory SPA — the overview is the "front door" for external visitors, while in-app navigation continues to land on the inventory view.

## Architecture

Server component with client islands, matching the existing part and minifig detail page patterns. Data fetched server-side; interactive elements (pricing, ownership, "Open Set") rendered as client components.

## Overview Page Content

### Hero Section

- Large set image (same treatment as SetDetailModal hero)
- Theme name label above title
- Set name as h1, set number displayed below
- Year and total piece count

### Stats Grid (2-column)

- **Used Price** — client component, fetched via existing `/api/prices/bricklink-set`
- **Inventory stats** — unique parts, unique colors via lightweight `SELECT COUNT(DISTINCT ...)` query against `rb_inventory_parts` (not the full `getSetInventoryRowsWithMeta` pipeline)

### Actions

- **"Open Set" CTA** — client component using shared `useOpenSet` hook (add to tabs, tab limit gate, navigate to `/sets?active={setNumber}`). Must render `<UpgradeModal>` for tab limit overflow.
- External links to BrickLink and Rebrickable
- `SetOwnershipAndCollectionsRow` component (existing)

### Content Sections

- **Minifigures** — grid of MinifigCards from `getSetMinifigsLocal`. Hidden if set has no minifigs.
- **Parts Summary** — unique parts count, unique colors count, rarity distribution (e.g., "12 parts appear in fewer than 5 sets")
- **Related Sets** — sets sharing the same `theme_id` (leaf subtheme — this is the most specific level, as `rb_sets.theme_id` always points to the leaf), sorted by year proximity to current set then alphabetically. Initial display of 8 sets with "Show more" pagination. Hidden if subtheme contains only the current set or `theme_id` is null.

## Navigation & Link Changes

### In-App Set Cards (Inventory-First Flow)

- `SetDisplayCard` — when no `onClick` provided, `href` changes from `/sets/{setNumber}` to `/sets?active={setNumber}`. This propagates automatically through `SetDisplayCardWithControls`.
- `SetTabItem` — keeps `href` to `/sets/{setNumber}` (overview). In SPA mode, clicks are `preventDefault`-ed and handled by `onActivate`, so the href only applies to middle-click/open-in-new-tab, where landing on the overview page is desirable.
- Collection page set cards — link to `/sets?active={setNumber}` (via `SetDisplayCard` default href change)
- Recent sets — already use modal-first flow via `IdentifySetListItem`, no change needed

### Discovery-Context Links (Modal-First Flow)

- `PartDetailClient` set list — clicking opens `SetDetailModal` instead of direct linking. Requires adding modal state management (follow `IdentifySetListItem` pattern).
- `PublicSetCard` — add `onClick` prop support (matching `SetDisplayCard` pattern), callers pass modal handler

### SetDetailModal Changes

- New **"Set Overview"** secondary button above "Open Set" — links to `/sets/{setNumber}`
- **"Open Set"** button — changes from `<Button href=...>` to using shared `useOpenSet` hook (add to tabs, navigate to `/sets?active={setNumber}`)
- New `activeSetNumber?: string` prop — when the modal's `setNumber` matches `activeSetNumber`, hide "Open Set" (caller provides this from SPA active tab state)

### Kebab Menu Changes

**Note:** `SetStatusMenu` is dead code. The actual kebab menu is implemented in `SetTopBar` using `MoreDropdown` > `SetOwnershipAndCollectionsRow` (dropdown variant). New options are added to `SetOwnershipAndCollectionsRow` when `variant="dropdown"`:

- **"Set Overview"** — links to `/sets/{setNumber}`
- **"Share"** — copies `{origin}/sets/{setNumber}` to clipboard with toast confirmation

### Route Transformation

- `/sets/[setNumber]/page.tsx` — `SetPageRedirector` removed, replaced with overview server component
- Metadata generation stays server-side (title, description)
- Existing redirect in `next.config.ts` (`/sets/id/:setNumber*` -> `/sets/:setNumber*`) continues to work correctly

## Shared `useOpenSet` Hook

Composes the existing `useGatedOpenTab` hook (which already handles tab limit gating and upgrade modal) with additional concerns:

1. Call `useGatedOpenTab().openTab()` — handles add-to-tabs + tab limit gate
2. Add to recent sets (`addRecentSet` + `useSyncRecentSet`)
3. Navigate to `/sets?active={setNumber}` via `router.push`

Used by:

- Overview page "Open Set" button
- SetDetailModal "Open Set" button

`SetPageRedirector` is deleted after extraction.

## Parts Modal Enhancement

The part detail modal/row on the inventory page adds a link to `/parts/{partNum}`, following the same pattern used for minifig links to `/minifigs/{figNum}`.

## Related Sets Query Details

- **Source:** `rb_sets` table filtered by `theme_id` (leaf subtheme of current set)
- **Sort:** Year proximity to current set, then name alphabetically
- **Pagination:** First 8 server-rendered; subsequent batches via new API route (`/api/sets/[setNumber]/related`) with limit/offset params
- **Edge cases:** Section hidden if subtheme has only the current set or `theme_id` is null

## Out of Scope

- Sitemaps, structured data (schema.org), canonical links, OpenGraph tags — separate future work
- Changes to the `/sets` SPA container or tab system internals
