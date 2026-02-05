# Set Page Layout Shift Fix - COMPLETE

## Problem

On desktop, the `/sets/[setNumber]` page had two layout shifts:

1. **Tab switching**: SetTopBar loads first, then sidebar and pieces appear after inventory loads
2. **Page refresh/new set**: During SSR/hydration, tabs are empty (no localStorage), causing the full layout to appear suddenly

## Root Causes

### Issue 1: Conditional InventoryControls rendering

In `SetTabContainer.tsx`, `InventoryControls` was conditionally rendered only after inventory data loads:

```tsx
{
  !loading && !error && <InventoryControls />;
}
```

### Issue 2: SSR/Hydration mismatch

In `SetsPage`, during SSR the Zustand store has no tabs (localStorage unavailable on server), so the page rendered a centered spinner. On hydration, tabs populated and the grid layout appeared.

## Solution

### Part 1: Always render InventoryControls with disabled sidebar

- Always render `InventoryControls` regardless of loading state
- Pass `isLoading` prop through to show disabled sidebar triggers
- Add `disabled` prop to `DropdownTrigger` component

### Part 2: Render skeleton layout during SSR/hydration

- Track client mount with `hasMounted` state
- When hydrating with empty tabs, render a skeleton that matches the final layout structure
- Skeleton includes: tab bar placeholder, top bar placeholder, controls placeholder, and sidebar placeholder

## Files Modified

1. **`app/sets/page.tsx`**
   - Added `hasMounted` state to detect client mount
   - Added `isHydrating` derived state
   - Added skeleton layout for SSR/hydration when tabs are empty
   - Pass `isHydrating` to SetTabContainer

2. **`app/components/set/SetTabContainer.tsx`**
   - Added `isHydrating` prop
   - Changed from conditional `{!loading && !error && <InventoryControls />}` to always render
   - Combines `loading || isHydrating` for the loading state

3. **`app/components/set/InventoryControls.tsx`**
   - Added `isLoading` prop
   - Pass through to TopBarControls

4. **`app/components/set/controls/TopBarControls.tsx`**
   - Added `isLoading` prop
   - Always render Pieces/Colors triggers on desktop (even when loading)
   - Disable triggers when `isLoading` or no data available

5. **`app/components/ui/GroupedDropdown.tsx`**
   - Added `disabled` prop to `DropdownTrigger`
   - Disabled triggers get `pointer-events-none opacity-50` styling

## Result

- **Tab switching**: SetTopBar and sidebar with disabled triggers appear immediately. Once inventory loads, triggers become active.
- **Page refresh**: Skeleton layout with proper structure appears during SSR/hydration, preventing layout shift when tabs populate from localStorage.
