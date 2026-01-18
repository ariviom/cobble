# Multi-Tab Set View Implementation Plan - COMPLETE

## Goal

Browser-like tab switching for set views where scroll position, filters, and view options are preserved per tab.

## Architecture

### DOM Structure

```
<main className="overflow-auto">  // Scroll container (desktop)
  <SetContainer1 style={{ height: savedHeight, display: 'none' }}>
    {/* children unmounted when inactive */}
  </SetContainer1>
  <SetContainer2>
    <SetContent />  {/* only active tab's children are mounted */}
  </SetContainer2>
</main>
```

- **Scroll stays on `<main>`** (desktop) or `window` (mobile)
- **One container per open tab** - siblings inside the scroll parent
- **Only active tab has mounted children** - others are empty with explicit height
- **`display: none`** on inactive containers - don't contribute to layout

### State to Persist Per Tab

```typescript
type TabState = {
  // Scroll
  scrollTop: number; // main.scrollTop (desktop) or window.scrollY (mobile)
  containerHeight: number; // container height when switching away

  // Filters & View
  filter: InventoryFilter;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  view: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
};
```

## Tab Switch Flows

### Opening a New Tab (from dropdown)

1. **Prefetch** incoming set data (client-side fetch)
2. **Save current tab state:**
   - Capture `main.scrollTop` (desktop) or `window.scrollY` (mobile)
   - Capture container's `offsetHeight`
   - Capture current filter/sort/view options
3. **Update current container:**
   - Set explicit `height = offsetHeight`
   - Set `display: none`
   - Unmount children
4. **Create new container:**
   - Mount with fetched data
   - Scroll starts at top (new tab)
   - Default filter state

### Switching to Existing Tab

1. **Save current tab state:**
   - Capture scroll position
   - Capture container height
   - Capture filter/sort/view options
2. **Update current container:**
   - Set explicit `height`
   - Set `display: none`
   - Unmount children
3. **Restore target container:**
   - Set `display: block` (or remove display:none)
   - Set explicit `height` from saved state (ensures scroll position is valid)
   - Mount children with restored filter/sort/view options
   - Restore scroll position
4. **After render:**
   - Children render with correct filters
   - Natural height replaces explicit height

### Closing a Tab

1. If closing active tab, switch to adjacent tab first
2. Remove container from DOM
3. Clear tab state from store

## Implementation Details

### Scroll Handling (Mobile vs Desktop)

| Platform      | Scroll Container | Save             | Restore                     |
| ------------- | ---------------- | ---------------- | --------------------------- |
| Desktop (lg+) | `<main>` element | `main.scrollTop` | `main.scrollTop = saved`    |
| Mobile        | `window`         | `window.scrollY` | `window.scrollTo(0, saved)` |

Use `useIsDesktop()` hook (or media query) to determine which to use.

### Client-Side Data Fetching

When opening a new tab from the dropdown:

1. Show loading state in new container
2. Fetch set summary + inventory via client-side API calls:
   - `GET /api/sets/{setNumber}` (or use existing catalog endpoint)
   - `GET /api/inventory/{setNumber}`
3. Once loaded, render content

### Height Restoration

The explicit height on inactive containers ensures:

1. When switching back, `scrollTop` value is valid before children render
2. Children then render with correct filters, producing correct natural height
3. Filter restoration means content height should match what it was

Edge case: If inventory data changed server-side while tab was inactive, height might differ slightly. Acceptable - user is still near their previous position.

## File Changes

| File                                       | Change                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `app/store/open-tabs.ts`                   | **New** - Tab state store (tabs, active, per-tab state) |
| `app/sets/page.tsx`                        | **New** - SPA container with multiple set containers    |
| `app/sets/[setNumber]/page.tsx`            | Redirect to SPA after adding to tabs                    |
| `app/components/set/SetTabContainer.tsx`   | **New** - Individual tab container component            |
| `app/components/set/SetTabContent.tsx`     | **New** - Tab content (extracted from SetPageClient)    |
| `app/components/set/SetPageClient.tsx`     | Refactor or remove                                      |
| `app/components/set/SetTabBar.tsx`         | Wire up `onActivateTab`, `onCloseTab`                   |
| `app/components/set/InventoryProvider.tsx` | Accept initial filter state props                       |
| `app/hooks/useInventoryViewModel.ts`       | Accept initial filter state, expose current state       |

## Store Schema

```typescript
// app/store/open-tabs.ts

type OpenTab = {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
};

type TabState = {
  scrollTop: number;
  containerHeight: number;
  filter: InventoryFilter;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  view: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
};

type OpenTabsStore = {
  tabs: OpenTab[];
  activeSetNumber: string | null;
  tabStates: Record<string, TabState>; // keyed by setNumber

  // Actions
  openTab: (tab: OpenTab) => void;
  closeTab: (setNumber: string) => void;
  setActiveTab: (setNumber: string) => void;
  saveTabState: (setNumber: string, state: Partial<TabState>) => void;
  getTabState: (setNumber: string) => TabState | undefined;
};
```

## Implementation Phases

### Phase 1: Tab State Store

- Create `app/store/open-tabs.ts`
- Persist to localStorage
- Include all tab state (scroll, height, filters)

### Phase 2: SPA Container

- Create `app/sets/page.tsx`
- Render container per open tab
- Only mount children for active tab
- Handle height/display toggling

### Phase 3: Filter State Integration

- Modify `useInventoryViewModel` to accept initial state
- Expose current state for saving
- Wire up save/restore on tab switch

### Phase 4: Scroll Handling

- Implement mobile vs desktop detection
- Save/restore scroll position on switch
- Handle both `main.scrollTop` and `window.scrollY`

### Phase 5: Tab Bar Integration

- Wire up `onActivateTab` callback
- Wire up `onCloseTab` callback
- Handle opening new tabs from dropdown
- URL sync via `history.pushState`

### Phase 6: Client-Side Data Fetching

- Add loading state for new tabs
- Fetch set summary + inventory client-side
- Handle errors gracefully

### Phase 7: Entry Point Redirect

- Modify `/sets/[setNumber]` to redirect to SPA
- Ensure direct URLs still work
