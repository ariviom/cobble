# Claude Code Memory

## Project: Brick Party (LEGO set piece tracking)
- Next.js App Router + TypeScript + Tailwind v4 + Zustand + Dexie/IndexedDB
- 221 tests passing (Vitest)

## Key Patterns
- `null` = intentional absence; `undefined` = not loaded yet; use `??` not `||`
- Theme variables in Tailwind v4: strip `--color-` prefix (e.g. `bg-theme-primary`)
- Server modules import `server-only`; catalog via `getCatalogReadClient()`/`getCatalogWriteClient()`
- OpenTab store uses discriminated union: `SetTab | LandingTab` (v2 storage key)

## Recent Changes (Feb 2026)
- Refactored OpenTab to discriminated union with `type: 'set' | 'landing'`
- Renamed `setNumber` → `id`, `activeSetNumber` → `activeTabId` in open-tabs store
- Added `openLandingTab()` and `replaceLandingWithSet()` store actions
- Bumped storage to `brick_party_open_tabs_v2` with v1→v2 migration
- SetTabBar: removed modal, `+` button creates landing tab
- SetTabItem: landing tab renders Layers icon + "Sets" label
- SetsLandingContent: accepts `onSelectSet` callback for in-place tab replacement
- SetsPage: dual rendering (landing tabs + set tabs), auto-creates landing tab when empty
- Deleted AddTabContent.tsx (subsumed by landing tab)
- Navigation: `/sets/` prefix maps to 'sets' tab

## Files to Know
- `app/store/open-tabs.ts` — Tab state store (SetTab/LandingTab discriminated union)
- `app/sets/page.tsx` — SPA multi-tab container with landing tab support
- `app/components/set/SetTabBar.tsx` — Tab bar (imports types from store)
- `app/components/sets/SetsLandingContent.tsx` — Landing tab content
