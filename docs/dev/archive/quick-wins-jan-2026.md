# Quick Wins - January 2026

**Completed:** January 25, 2026

This document summarizes the quick wins completed from the backlog.

---

## 1. Search Party Button Missing in SetTopBar

**Problem:** The Search Party button wasn't rendering because the `searchParty` prop was only passed when `clientId` was truthy. Since `clientId` is set in a `useEffect`, it's `null` on initial render.

**Solution:** Always pass the `searchParty` prop to `SetTopBar`, with `loading: true` and `canHost: false` when `clientId` isn't ready yet.

**Files Changed:**

- `app/components/set/SetPageClient.tsx`

---

## 2. Login Redirect to Home Page

**Problem:** After login, users were redirected to `/account` instead of the home page.

**Solution:** Changed all auth redirect destinations from `/account` to `/`.

**Files Changed:**

- `app/lib/supabaseClient.ts` - Updated `getAuthRedirectUrl()` to return origin without `/account`
- `app/login/page.tsx` - Changed post-login redirects to `/`
- `app/auth/callback/route.ts` - Changed default `next` parameter to `/`

---

## 3. Button Contrast on Matching Backgrounds

**Problem:** When a user's theme color matched a page header's background color (e.g., blue theme with blue search header), there was no visual contrast between the navbar and header.

**Solution:** Created a system that automatically picks a contrasting header color when the preferred color matches the theme.

**Files Created:**

- `app/hooks/useContrastingHeaderColor.ts` - Hook that returns a safe color different from the theme
- `app/components/ui/ThemedPageHeader.tsx` - Wrapper component for page headers

**Files Changed:**

- `app/page.tsx` - Updated hero section to use `ThemedPageHeader`
- `app/search/page.tsx` - Updated header to use `ThemedPageHeader`
- `app/identify/IdentifyClient.tsx` - Updated both hero banners to use `ThemedPageHeader`

**Fallback Colors:**
| Theme | Fallback |
|-------|----------|
| blue | purple |
| purple | blue |
| green | purple |
| red | purple |
| yellow | purple |

---

## 4. Nav Transition Double-Highlight

**Problem:** When pressing nav items on mobile, both the current page item (white background) and the pressed item (also white from `:active` state) appeared highlighted.

**Solution:** Changed hover/active states on inactive nav items to use subtle overlays instead of solid white backgrounds.

**Files Changed:**

- `app/components/nav/NavLinkItem.tsx` - Changed from `hover:bg-white` to `hover:bg-white/15` and `active:bg-white` to `active:bg-black/10`

---

## 5. Bottom Sheet Overlap with Tab Bar

**Problem:** On mobile, dropdown panels extended to `bottom-0`, overlapping with the fixed navigation bar.

**Solution:** Changed the bottom positioning to respect the nav bar height.

**Files Changed:**

- `app/components/ui/GroupedDropdown.tsx` - Changed `bottom-0` to `bottom-[var(--spacing-nav-height)]` in `panelVariants`

---

## 6. Disable Color Filters When Pieces Excluded

**Problem:** Color filter options remained enabled even when no pieces of that color matched the current display/category filters, leading to confusing UX.

**Solution:** Added tracking of which colors have matching pieces after display and category filters are applied, then disabled/grayed options with no matches.

**Files Changed:**

- `app/hooks/useInventoryViewModel.ts` - Added `availableColors` computed value
- `app/components/set/InventoryProvider.tsx` - Exposed `availableColors` in context
- `app/components/set/InventoryControls.tsx` - Passed `availableColors` to controls
- `app/components/set/controls/TopBarControls.tsx` - Passed `availableColors` to color panel
- `app/components/set/controls/SidebarColorPanel.tsx` - Added disabled styling for unavailable colors
- `app/components/ui/RowButton.tsx` - Added disabled styles
- `app/components/ui/RowCheckbox.tsx` - Added disabled styles

---

## 7. Page Titles

**Problem:** Most pages used the default title from `layout.tsx`, making it hard to identify tabs when multiple are open.

**Solution:** Added page-specific metadata exports for static pages and `generateMetadata` functions for dynamic pages.

**Files Changed:**

- `app/search/page.tsx` - Added static metadata
- `app/identify/page.tsx` - Added static metadata
- `app/account/page.tsx` - Added static metadata
- `app/collection/page.tsx` - Added static metadata
- `app/sets/[setNumber]/page.tsx` - Added `generateMetadata` for dynamic set titles
- `app/collection/[handle]/page.tsx` - Added `generateMetadata` for dynamic collection titles

**Title Format:**

- Static pages: `{Page Name} | Brick Party`
- Set pages: `{setNumber} {setName} | Brick Party`
- Collection pages: `{displayName}'s Collection | Brick Party`
