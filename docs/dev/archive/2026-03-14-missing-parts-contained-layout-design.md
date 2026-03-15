# Missing Parts Contained Layout

## Problem

In the Collection Parts "Missing" view, set headers and part cards are visually indistinguishable — both render as sibling cards with the same border/background. In list view especially, it's hard to tell where one set's parts end and the next set begins.

## Solution

Move the parts grid/list/micro rendering **inside** the set card so each set is a single container that holds both its header and its missing parts.

## Structure

### Before

```
<div className="flex flex-col gap-2">     ← outer wrapper per set
  <div className="... bg-card-muted ..."> ← set header card
    checkbox, thumbnail, name, chevron
  </div>
  {expanded && renderParts()}             ← parts as siblings, outside the card
</div>
```

### After

```
<div className="... bg-card ...">         ← single card wraps everything
  <div className="...">                   ← header section (no card styling)
    checkbox, thumbnail, name, chevron
  </div>
  {expanded && (
    <div className="border-t border-subtle p-3">
      renderParts()                       ← parts inside the card
    </div>
  )}
  <SetDetailModal ... />                  ← unchanged, portal-rendered
</div>
```

## Changes

### `MissingPartsSetGroup.tsx`

1. The outermost `div` becomes the card container (`rounded-lg border border-subtle bg-card`).
2. The header row loses its own card styling (`border`, `bg-card-muted`, `rounded-lg`) — it becomes a plain flex row. The header background intentionally changes from `bg-card-muted` to the parent card's `bg-card` — the muted background was only needed when header and parts were separate cards and needed visual distinction. Now the card boundary itself provides that distinction.
3. The expanded parts section renders inside the card, separated by a `border-t border-subtle` with `p-3` padding.
4. Collapse works identically — `expanded && ...` renders the parts section or hides it.

### Files NOT changed

- `CollectionPartCard.tsx` — untouched, renders the same way in all view modes.
- `CollectionPartsView.tsx` — untouched (already uses `gap-6` between set groups).
- `app/components/ui/PartCard.tsx` — untouched.
- `gridClassName.ts`, `sorting.ts`, `aggregation.ts` — untouched.
- Selection, modal, expand/collapse logic — untouched.

## Visual Hierarchy

- **Set card**: `bg-card` with `border border-subtle rounded-lg` — the primary container.
- **Header section**: no border/background of its own, uses card's background.
- **Parts section**: separated from header by `border-t border-subtle`, padded with `p-3`.
- **Part cards inside**: retain their existing styling (including individual borders from `PartCard`). They're visually subordinate within the parent set card.
- **Between sets**: `gap-6` in `CollectionPartsView` provides clear separation.

## Scope

This is a CSS/JSX restructuring of `MissingPartsSetGroup.tsx` only. No logic changes, no data flow changes, no new components.
