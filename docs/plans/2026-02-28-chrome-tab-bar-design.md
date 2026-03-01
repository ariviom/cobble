# Chrome-Style Tab Bar Refactor

**Date:** 2026-02-28
**Status:** Approved

## Goal

Refactor the set tabs bar to support unlimited tabs with a visual design matching native Chrome browser tabs — rounded tops with concave curves at the bottom corners where the tab meets the bar.

## Tab Shape

**Technique:** Pseudo-elements with `radial-gradient` for the concave bottom curves.

- **Top corners:** `border-radius: 8px 8px 0 0` on the tab element
- **Bottom concave curves (active tab only):** `::before` and `::after` pseudo-elements positioned outside the tab's left/right edges, using `radial-gradient(circle at top-right, transparent 8px, bg-card 8px)` (left side) and mirrored for right
- **Result:** Consistent 8px-radius concave curves regardless of tab width

Only the active tab gets the concave bottom curves. Inactive tabs have rounded tops but flat bottoms.

## Sizing & Overflow (Shrink-then-Scroll)

- Tabs use `flex: 1 1 auto` — share available space equally
- **Max width:** ~240px desktop, ~160px mobile
- **Min width:** ~100px desktop, ~80px mobile
- As tabs are added, they shrink proportionally
- Once all tabs hit min-width, horizontal `overflow-x: auto` activates (with `no-scrollbar`)
- "+" button remains sticky/fixed at right edge

**Content truncation at small widths:**

- Set image thumbnail: always visible (20x20)
- Set number: always visible, truncated
- Set name: hidden below ~160px via overflow/ellipsis (already hidden on mobile)
- Close button: always visible, right edge

## Visual Styling

### Active Tab

- Background: `bg-card` (matches content area below)
- Top corners: 8px border-radius
- Bottom: concave curves via pseudo-elements, no bottom border
- Text: `text-foreground`, bold set number
- Z-index elevated above neighbors

### Inactive Tabs

- Background: transparent (shows `bg-background` bar)
- Top corners: 8px border-radius (same shape, see-through)
- No concave bottom curves
- Text: `text-foreground-muted`
- Hover: slight `bg-foreground/5` fill

### Dividers

- Thin vertical dividers between inactive tabs (current behavior)
- Suppressed adjacent to the active tab (current `showDivider` logic)

### Tab Bar

- Background: `bg-background`
- Bottom border: 1px `bg-subtle`, broken under active tab
- Height: 44px mobile / 36px desktop (unchanged)

## Mobile

- Same Chrome-style shape on mobile
- Active tab: `fixed left-0 z-10` (pinned left, unchanged)
- Other tabs scroll horizontally behind with `no-scrollbar`
- Tab bar wrapper: `pl-36` mobile padding for fixed active tab (unchanged)
- "+" button: `fixed right-0` mobile (unchanged)

## Component Changes

### `SetTabItem.tsx` (main changes)

- Replace `rounded-t-sm` → `rounded-t-lg` (8px)
- Add `::before`/`::after` pseudo-elements for concave curves (active tab only)
- Remove "bridge" div — concave curves handle visual connection
- Flex sizing: `flex: 1 1 auto`, `max-w-60`, `min-w-25`
- Keep divider logic (suppress adjacent to active)

### `SetTabBar.tsx` (minor changes)

- Tab items get flex sizing constraints
- Bottom border line stays as-is

### `globals.css` (new utility)

- Add `@utility` for the concave curve pseudo-elements

### No Store Changes

- `open-tabs.ts`, `useGatedOpenTab.ts`, tab management logic — all untouched
- Purely visual/component refactor

## No Reordering

- Tabs remain append-only order
- No drag-to-reorder in this iteration
