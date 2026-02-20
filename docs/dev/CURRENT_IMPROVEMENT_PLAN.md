# Full UI Visual Refresh: LEGO Retail Polish

**Last Updated:** February 18, 2026
**Status:** Ready for implementation

## Problem Statement

The current UI uses a "chunky LEGO brick" metaphor — heavy 2px borders, hard flat offset shadows, modest border-radii — that reads as dated and slightly "AI slop." The LEGO reference screenshots (in `ui_ref/`) show the official LEGO Insiders app and LEGO.com use a cleaner, more modern visual language while staying playful and on-brand.

## Design Direction

**"LEGO Retail Polish"** — Clean, bright, modern. Inspired by the official LEGO Insiders app and LEGO.com product pages.

| Attribute          | Current (Brick Metaphor)                       | Target (Retail Polish)                                |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| **Shadows**        | Hard flat offsets (`0 4px 0 0`)                | Soft blurred (`0 2px 5px -1px rgba(...)`)             |
| **Borders**        | 2px everywhere (`border-2`)                    | 1px standard (`border`)                               |
| **Button radius**  | 12px (`rounded-md`)                            | 24px (`rounded-xl`) — pill-ish                        |
| **Badge radius**   | 8px (`rounded-sm`)                             | Full pill (`rounded-full`)                            |
| **Card radius**    | 16px (`rounded-lg`)                            | Keep 16px                                             |
| **Button depth**   | 4px hard offset, press-down                    | Soft blur, press-down (same interaction, softer look) |
| **Card elevation** | `shadow-[0_4px_0_0_var(--color-shadow-depth)]` | `shadow-md` (Tailwind soft shadow)                    |
| **Modal**          | 8px colored top border, 8px hard shadow        | 4px colored top border, `shadow-xl` soft              |
| **Comments**       | "CHUNKY", "BOLD", "tactile"                    | "Clean", "polished", "refined"                        |

### What stays the same

- Component APIs (props, variants, sizes)
- Layout structure (grids, flexbox, responsive breakpoints)
- Typography system (CeraPro, weight scale, size scale)
- Color palette (neutrals, brand colors, theme colors, semantic colors)
- Dark mode implementation (class-based toggle, neutral inversion)
- The press-down interaction metaphor (translateY on hover/active)
- Card color-strip variants (border-t-4 decorative tops)
- BrickLoader animation
- All data flow, routing, and business logic

---

## Phase 1: Design Token Foundation

### File: `app/styles/globals.css`

#### 1.1 Shadow scale — soft blurred

Replace flat offset shadows with modern diffused shadows:

```css
/* Before (hard offset) */
--shadow-sm: 0 2px 0 rgba(0, 0, 0, 0.1);
--shadow-md: 0 3px 0 rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 4px 0 rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 6px 0 rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.12);

/* After (soft blur) */
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-md:
  0 4px 8px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
--shadow-lg:
  0 8px 16px -2px rgba(0, 0, 0, 0.1), 0 4px 6px -1px rgba(0, 0, 0, 0.05);
--shadow-xl:
  0 16px 32px -4px rgba(0, 0, 0, 0.12), 0 8px 16px -4px rgba(0, 0, 0, 0.06);
```

#### 1.2 Remove unused depth tokens

Remove these tokens (zero consumers after Phase 2 updates):

- `--brick-depth: 0 4px 0`
- `--brick-depth-sm: 0 3px 0`
- `--brick-depth-pressed: 0 1px 0`
- `--color-shadow-depth` (both light and dark definitions)

#### 1.3 Brick button depth — soft press

Replace hard offset press with soft blur press. Keep the translateY press-down metaphor.

```css
/* brick-button-depth (primary variant) */
.brick-button-depth {
  box-shadow:
    0 2px 5px -1px rgba(0, 0, 0, 0.15),
    0 1px 3px -1px rgba(0, 0, 0, 0.1);
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
}
.brick-button-depth:hover:not(:disabled) {
  box-shadow:
    0 1px 3px -1px rgba(0, 0, 0, 0.15),
    0 1px 2px -1px rgba(0, 0, 0, 0.08);
  transform: translateY(1px);
}
.brick-button-depth:active:not(:disabled) {
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.1);
  transform: translateY(2px);
}

/* brick-button-depth-sm (secondary variant) */
.brick-button-depth-sm {
  box-shadow:
    0 1px 3px -1px rgba(0, 0, 0, 0.12),
    0 1px 2px -1px rgba(0, 0, 0, 0.08);
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
}
.brick-button-depth-sm:hover:not(:disabled) {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transform: translateY(1px);
}
.brick-button-depth-sm:active:not(:disabled) {
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.08);
  transform: translateY(2px);
}
```

Remove the `--_brick-shadow` internal variable — no longer needed since shadows use hardcoded neutral rgba.

#### 1.4 Remove brick-shadow utility

Remove `@utility brick-shadow` (line ~428) — references the old `--brick-depth` token.

#### 1.5 Update comments

Change section comments to reflect the new direction:

- `/* Radius scale - CHUNKY like LEGO bricks */` → `/* Radius scale */`
- `/* Shadow scale - BOLD and tactile */` → `/* Shadow scale - soft and diffused */`
- `/* Brick depth - the "3D pressed" effect */` → remove section (tokens removed)
- `/* LEGO brick-like effects */` → remove (utility removed)
- `/* Brick button depth - 3D pressed effect... */` → `/* Button depth - soft press effect for interactive buttons */`

---

## Phase 2: UI Primitives

Each component below lists the specific class changes. The pattern is consistent:

- `border-2` → `border` (1px instead of 2px)
- `rounded-md` → `rounded-lg` or `rounded-xl` (more generous radii)
- Inline hard-offset shadows → Tailwind soft shadow utilities (`shadow-sm`, `shadow-md`, etc.)

### 2.1 Button.tsx

| Property | Before                | After               |
| -------- | --------------------- | ------------------- |
| CVA base | `rounded-md border-2` | `rounded-xl border` |

No variant changes needed — the base class cascade handles everything. All button variants already reference `brick-button-depth` (which gets the soft treatment in Phase 1) or have no shadow.

### 2.2 Card.tsx

| Property    | Before                                                                                                                                             | After                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| CVA base    | `rounded-lg border-2 bg-card`                                                                                                                      | `rounded-lg border bg-card`                                                    |
| Elevated    | `shadow-[0_4px_0_0_var(--color-shadow-depth)]`                                                                                                     | `shadow-md`                                                                    |
| Interactive | `hover:-translate-y-1 hover:shadow-[0_6px_0_0_var(--color-shadow-depth)] active:translate-y-0 active:shadow-[0_2px_0_0_var(--color-shadow-depth)]` | `hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-sm` |

Color strip variants (`border-t-4 border-t-theme-primary`) stay unchanged.

### 2.3 Modal.tsx

| Property | Before                                                                                                | After                                                          |
| -------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Panel    | `rounded-lg border-t-[8px] border-theme-primary bg-card shadow-[0_8px_0_0_var(--color-shadow-depth)]` | `rounded-xl border-t-4 border-theme-primary bg-card shadow-xl` |

### 2.4 Badge.tsx

| Property        | Before                   | After                  |
| --------------- | ------------------------ | ---------------------- |
| Size xs         | `rounded-sm`             | `rounded-full`         |
| Size sm         | `rounded-sm`             | `rounded-full`         |
| Size md         | `rounded-sm`             | `rounded-full`         |
| Size lg         | `rounded-md`             | `rounded-full`         |
| Outline variant | `border-2 border-subtle` | `border border-subtle` |

### 2.5 Input.tsx

| Property | Before                              | After                             |
| -------- | ----------------------------------- | --------------------------------- |
| CVA base | `border-2 border-subtle rounded-md` | `border border-subtle rounded-lg` |

### 2.6 Select.tsx

| Property | Before                              | After                             |
| -------- | ----------------------------------- | --------------------------------- |
| CVA base | `border-2 border-subtle rounded-md` | `border border-subtle rounded-lg` |

### 2.7 Tabs.tsx

| Property                    | Before                                         | After                             |
| --------------------------- | ---------------------------------------------- | --------------------------------- |
| TabsList                    | `rounded-lg border-2 border-subtle`            | `rounded-xl border border-subtle` |
| TabsTrigger                 | `rounded-md`                                   | `rounded-lg`                      |
| TabsTrigger selected shadow | `shadow-[0_2px_0_0_var(--color-shadow-depth)]` | `shadow-sm`                       |

### 2.8 Alert.tsx

| Property | Before                                         | After                                        |
| -------- | ---------------------------------------------- | -------------------------------------------- |
| CVA base | `rounded-lg border-2 border-subtle border-l-4` | `rounded-lg border border-subtle border-l-4` |

### 2.9 Toast.tsx

| Property        | Before                                 | After                                         |
| --------------- | -------------------------------------- | --------------------------------------------- |
| Container       | `border-2`                             | `border`                                      |
| Variant shadows | `shadow-[0_2px_0_0] shadow-brand-*/25` | Remove shadows entirely (rely on border + bg) |

### 2.10 SegmentedControl.tsx

| Property  | Before                              | After                             |
| --------- | ----------------------------------- | --------------------------------- |
| Container | `rounded-md border-2 border-subtle` | `rounded-xl border border-subtle` |

### 2.11 GroupedDropdown.tsx

| Property       | Before                                                                                        | After                                                    |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Trigger base   | `rounded-md border-2 border-subtle`                                                           | `rounded-lg border border-subtle`                        |
| Panel base     | `border-2 ... rounded-t-lg ... lg:rounded-lg lg:shadow-[0_4px_0_0_var(--color-shadow-depth)]` | `border ... rounded-t-xl ... lg:rounded-xl lg:shadow-lg` |
| Section header | `border-b-2 border-subtle`                                                                    | `border-b border-subtle`                                 |
| Footer         | `border-t-2 border-subtle`                                                                    | `border-t border-subtle`                                 |

### 2.12 Switch.tsx

| Property | Before     | After    |
| -------- | ---------- | -------- |
| Track    | `border-2` | `border` |

### 2.13 IconButton.tsx

| Property        | Before                   | After                  |
| --------------- | ------------------------ | ---------------------- |
| Outline variant | `border-2 border-subtle` | `border border-subtle` |
| Size sm         | `rounded-sm`             | `rounded-md`           |
| Size md         | `rounded-md`             | `rounded-lg`           |
| Size lg         | `rounded-md`             | `rounded-lg`           |

### 2.14 Checkbox.tsx

Keep `border-2` — small form controls need visual weight at 16px. No change.

### 2.15 Spinner.tsx

Keep `border-2` — the spinning indicator needs visible border thickness. No change.

### 2.16 ErrorBanner.tsx

| Property  | Before                              | After                             |
| --------- | ----------------------------------- | --------------------------------- |
| Container | `rounded-md border-2 border-danger` | `rounded-lg border border-danger` |

### 2.17 StatusToggleButton.tsx

| Property       | Before                                 | After                                           |
| -------------- | -------------------------------------- | ----------------------------------------------- |
| Base           | `rounded-md`                           | `rounded-lg`                                    |
| Default        | `rounded-md border-2 border-subtle`    | `rounded-lg border border-subtle`               |
| Inline         | `border-2 border-subtle`               | `border border-subtle`                          |
| Dropdown       | `rounded-md`                           | `rounded-lg`                                    |
| Active shadows | `shadow-[0_2px_0_0] shadow-brand-*/25` | Remove shadows (rely on bg tint + border color) |

### 2.18 RowButton.tsx

No border changes needed — RowButton has no borders. Keep as-is.

### 2.19 SignInPrompt.tsx

| Property  | Before     | After    |
| --------- | ---------- | -------- |
| Container | `border-2` | `border` |

(Verify exact usage by reading file during implementation.)

### 2.20 RowCheckbox.tsx

| Property               | Before | After                                                              |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| Check `border-2` usage | Verify | `border-2` → `border` if on container; keep if on checkbox element |

### 2.21 QuantityDropdown.tsx

| Property               | Before | After                                        |
| ---------------------- | ------ | -------------------------------------------- |
| Check `border-2` usage | Verify | `border-2` → `border` for container elements |

### 2.22 Skeleton.tsx

| Property     | Before                              | After                             |
| ------------ | ----------------------------------- | --------------------------------- |
| SkeletonCard | `rounded-lg border-2 border-subtle` | `rounded-lg border border-subtle` |

Skeleton variant radii (`rounded-sm`, `rounded-md`) stay as-is — they match the content they placeholder for.

---

## Phase 3: Navigation & Chrome

### 3.1 Navigation.tsx

| Property   | Before                                                           | After                                                                         |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Nav shadow | `shadow-[color:var(--color-shadow-depth)] lg:shadow-[0_4px_0_0]` | `shadow-[0_-2px_8px_rgba(0,0,0,0.08)] lg:shadow-[0_2px_8px_rgba(0,0,0,0.08)]` |

Mobile: soft shadow upward (nav is at bottom). Desktop: soft shadow downward (nav is at top).

### 3.2 NavLinkItem.tsx

| Property | Before       | After        |
| -------- | ------------ | ------------ |
| Base     | `rounded-md` | `rounded-lg` |

Active/inactive styles stay the same — the white pill with inset shadow is already polished.

### 3.3 SetTopBar.tsx

Pattern-based: all `border-2` → `border`, all `rounded-md` → `rounded-lg`. Read file during implementation to apply precisely.

---

## Phase 4: Feature Component Cascade

Many feature components use `border-2` and `rounded-md` inline (not through UI primitives). Apply the same pattern:

- `border-2` → `border`
- `rounded-md` → `rounded-lg`
- Any inline `shadow-[0_Npx_0_0_var(--color-shadow-depth)]` → appropriate Tailwind shadow utility

### Feature files with `border-2` (verify each during implementation):

| File                                                     | Notes                                        |
| -------------------------------------------------------- | -------------------------------------------- |
| `app/account/components/DisplayTab.tsx`                  | Theme picker buttons, inventory view buttons |
| `app/account/components/SetsTab.tsx`                     | Verify inline borders                        |
| `app/account/components/FeedbackTab.tsx`                 | Verify inline borders                        |
| `app/components/sets/SetsLandingContent.tsx`             | Verify inline borders                        |
| `app/identify/IdentifyClient.tsx`                        | Verify inline borders                        |
| `app/components/set/items/InventoryItem.tsx`             | Verify inline borders                        |
| `app/components/set/items/InventoryItemModal.tsx`        | Verify inline borders                        |
| `app/components/set/items/OwnedQuantityControl.tsx`      | Verify inline borders                        |
| `app/components/identify/IdentifyResultCard.tsx`         | Verify inline borders                        |
| `app/components/identify/IdentifySetListItem.tsx`        | Verify inline borders                        |
| `app/components/minifig/MinifigPageClient.tsx`           | Verify inline borders                        |
| `app/components/minifig/MinifigSearchResultItem.tsx`     | Verify inline borders                        |
| `app/components/group/GroupSessionPageClient.tsx`        | Verify inline borders                        |
| `app/components/ErrorBoundary.tsx`                       | Verify inline borders                        |
| `app/components/collections/CollectionsModalContent.tsx` | Verify inline borders                        |
| `app/components/search/SearchResults.tsx`                | Verify inline borders                        |
| `app/components/home/RecentlyViewedSets.tsx`             | Verify inline borders                        |
| `app/components/set/SetStatusMenu.tsx`                   | Verify inline borders                        |
| `app/join/JoinPageClient.tsx`                            | Verify inline borders                        |

### Feature files with `rounded-md` (verify each during implementation):

| File                                                     | Notes                  |
| -------------------------------------------------------- | ---------------------- |
| `app/account/components/DisplayTab.tsx`                  | Buttons → `rounded-lg` |
| `app/account/components/FeedbackTab.tsx`                 | Verify                 |
| `app/components/set/items/InventoryItem.tsx`             | Verify                 |
| `app/components/identify/IdentifyResultCard.tsx`         | Verify                 |
| `app/components/identify/IdentifyHistory.tsx`            | Verify                 |
| `app/components/minifig/MinifigPageClient.tsx`           | Verify                 |
| `app/components/minifig/MinifigCard.tsx`                 | Verify                 |
| `app/components/group/GroupSessionPageClient.tsx`        | Verify                 |
| `app/components/ErrorBoundary.tsx`                       | Verify                 |
| `app/components/set/SetTabItem.tsx`                      | Verify                 |
| `app/components/set/SetDisplayCard.tsx`                  | Verify                 |
| `app/components/set/PublicSetCard.tsx`                   | Verify                 |
| `app/components/set/SetStatusMenu.tsx`                   | Verify                 |
| `app/components/collections/CollectionsModalContent.tsx` | Verify                 |
| `app/components/search/SearchResults.tsx`                | Verify                 |
| `app/components/ui/MoreDropdown.tsx`                     | Verify                 |
| `app/components/ui/ImagePlaceholder.tsx`                 | Verify                 |
| `app/user/[handle]/page.tsx`                             | Verify                 |
| `app/collection/[handle]/page.tsx`                       | Verify                 |
| `app/join/JoinPageClient.tsx`                            | Verify                 |

**Exception rule**: Keep `rounded-md` where it's used for small decorative elements (image placeholders, color swatches, skeleton placeholders) where a larger radius would look odd. Only increase to `rounded-lg` for interactive elements and containers.

---

## Phase 5: Verification

1. **Grep** for remaining references:
   - `border-2` in component files (expect only Checkbox, Spinner, and intentional exceptions)
   - `shadow-[0_` inline hard-offset shadows (expect zero)
   - `color-shadow-depth` (expect only globals.css dark mode if kept, otherwise zero)
   - `brick-depth` tokens (expect zero consumers)
2. **Type check**: `npx tsc --noEmit`
3. **Lint**: `npm run lint`
4. **Visual spot-check** key surfaces:
   - Buttons (all variants) — soft depth shadow, pill shape
   - Cards (default, elevated, interactive) — 1px border, soft shadow
   - Badges — full pill shape
   - Tabs (selected) — soft shadow
   - Modal — rounded-xl, 4px top border, soft shadow
   - Navigation bar — soft shadow (mobile: upward, desktop: downward)
   - Inputs/Selects — 1px border, rounded-lg
   - Toast notifications — no shadow, semantic backgrounds
   - Alert — 1px border
   - Dark mode — verify shadows look correct on dark backgrounds

---

## Implementation Order

1. Phase 1 first (foundation) — all downstream components benefit immediately
2. Phase 2 next (UI primitives) — cascades to all consumers of these components
3. Phase 3 (navigation) — high-visibility chrome
4. Phase 4 (feature cascade) — read each file, apply pattern
5. Phase 5 (verification) — grep + type check + lint

Each phase can be committed independently. Phase 2 is the largest.

---

## Files Changed Summary

| Layer         | Files                                                          | Change Pattern                                                       |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Foundation    | `globals.css`                                                  | Shadow tokens, brick-depth, comments                                 |
| Buttons       | `Button.tsx`                                                   | `rounded-md border-2` → `rounded-xl border`                          |
| Cards         | `Card.tsx`                                                     | `border-2` → `border`, inline shadows → Tailwind utilities           |
| Modal         | `Modal.tsx`                                                    | `rounded-lg` → `rounded-xl`, `border-t-[8px]` → `border-t-4`, shadow |
| Badges        | `Badge.tsx`                                                    | All sizes → `rounded-full`, outline `border-2` → `border`            |
| Forms         | `Input.tsx`, `Select.tsx`                                      | `border-2 rounded-md` → `border rounded-lg`                          |
| Tabs          | `Tabs.tsx`                                                     | `border-2` → `border`, `rounded-md` → `rounded-lg`/`rounded-xl`      |
| Feedback      | `Alert.tsx`, `Toast.tsx`, `ErrorBanner.tsx`                    | `border-2` → `border`, remove toast shadows                          |
| Controls      | `SegmentedControl.tsx`, `Switch.tsx`, `StatusToggleButton.tsx` | `border-2` → `border`, radius increases                              |
| Dropdowns     | `GroupedDropdown.tsx`, `QuantityDropdown.tsx`                  | `border-2` → `border`, shadow, radius                                |
| Icons         | `IconButton.tsx`                                               | `border-2` → `border`, radius increases                              |
| Skeleton      | `Skeleton.tsx`                                                 | SkeletonCard `border-2` → `border`                                   |
| Navigation    | `Navigation.tsx`, `NavLinkItem.tsx`, `SetTopBar.tsx`           | Soft shadows, radius increases                                       |
| Feature (~20) | See Phase 4 tables                                             | `border-2` → `border`, `rounded-md` → `rounded-lg`                   |

**Total estimated files: ~45**
