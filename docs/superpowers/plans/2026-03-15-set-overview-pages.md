# Set Overview Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create standalone set overview pages at `/sets/[setNumber]` for SEO and sharing, while keeping in-app navigation inventory-first.

**Architecture:** Server component with client islands at `/sets/[setNumber]`, following the minifig detail page pattern. A shared `useOpenSet` hook extracts tab-opening logic from `SetPageRedirector`. In-app links updated to target the SPA directly (`/sets?active={setNumber}`), while discovery-context links open modals.

**Tech Stack:** Next.js (App Router), React Server Components, Zustand, Supabase, TanStack Query

**Spec:** `docs/dev/SET_OVERVIEW_PAGES_PLAN.md`

---

## Chunk 0: DRY Extractions (Prerequisite)

### Task 0A: Extract shared `formatCurrency` utility

The same price formatting logic is duplicated in `SetDetailModal.tsx:38`, `MinifigPageClient.tsx:30`, `InventoryItemModal.tsx:105`. Extract once before adding a 4th copy.

**Files:**

- Create: `app/lib/utils/formatCurrency.ts`
- Modify: `app/components/set/SetDetailModal.tsx` (remove `formatModalPrice`, import shared)
- Modify: `app/components/minifig/MinifigPageClient.tsx` (remove `formatPrice`, import shared)
- Modify: `app/components/set/items/InventoryItemModal.tsx` (remove `formatModalPrice`, import shared)

- [ ] **Step 1: Create shared utility**

```typescript
// app/lib/utils/formatCurrency.ts
export function formatCurrency(
  value: number,
  currency: string | null | undefined
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency ?? '$'}${value.toFixed(2)}`;
  }
}
```

- [ ] **Step 2: Update SetDetailModal**

Replace `formatModalPrice` definition (lines 38-52) with:

```tsx
import { formatCurrency } from '@/app/lib/utils/formatCurrency';
```

Then replace all calls: `formatModalPrice(value, currency)` → `formatCurrency(value, currency)`.

- [ ] **Step 3: Update MinifigPageClient**

Replace `formatPrice` definition (around line 30) with the same import. Replace all calls.

- [ ] **Step 4: Update InventoryItemModal**

Replace `formatModalPrice` definition (lines 105-119) with the same import. Replace all calls.

- [ ] **Step 5: Run type check and tests**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add app/lib/utils/formatCurrency.ts app/components/set/SetDetailModal.tsx app/components/minifig/MinifigPageClient.tsx app/components/set/items/InventoryItemModal.tsx
git commit -m "refactor: extract shared formatCurrency utility"
```

---

### Task 0B: Extract shared external URL helpers

BrickLink/Rebrickable set URL construction is duplicated in `SetDetailModal.tsx:77-78`, `SetTopBar.tsx:121-124`, and will be needed by the overview.

**Files:**

- Create: `app/lib/utils/externalUrls.ts`
- Modify: `app/components/set/SetDetailModal.tsx`
- Modify: `app/components/nav/SetTopBar.tsx`

- [ ] **Step 1: Create URL helpers**

```typescript
// app/lib/utils/externalUrls.ts
export function getBricklinkSetUrl(setNumber: string): string {
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(setNumber)}`;
}

export function getRebrickableSetUrl(setNumber: string): string {
  return `https://rebrickable.com/sets/${encodeURIComponent(setNumber)}/`;
}
```

- [ ] **Step 2: Update SetDetailModal**

Replace lines 77-78 with imports:

```tsx
import {
  getBricklinkSetUrl,
  getRebrickableSetUrl,
} from '@/app/lib/utils/externalUrls';
// ...
const bricklinkSetUrl = getBricklinkSetUrl(setNumber);
const rebrickableSetUrl = getRebrickableSetUrl(setNumber);
```

- [ ] **Step 3: Update SetTopBar**

Replace lines 121-124 with the same pattern.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/lib/utils/externalUrls.ts app/components/set/SetDetailModal.tsx app/components/nav/SetTopBar.tsx
git commit -m "refactor: extract shared BrickLink/Rebrickable URL helpers"
```

---

## Chunk 1: Foundation — `useOpenSet` Hook & Link Changes

### Task 1: Create `useOpenSet` hook

Extracts tab-opening logic from `SetPageRedirector` into a reusable hook that composes `useGatedOpenTab`.

**Files:**

- Create: `app/hooks/useOpenSet.ts`
- Create: `app/hooks/__tests__/useOpenSet.test.ts`
- Reference: `app/components/set/SetPageRedirector.tsx` (lines 38-96)
- Reference: `app/hooks/useGatedOpenTab.ts`

- [ ] **Step 1: Write test for useOpenSet**

```typescript
// app/hooks/__tests__/useOpenSet.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOpenSet } from '../useOpenSet';

// Mock dependencies
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockOpenTab = vi.fn(() => true);
const mockDismissUpgradeModal = vi.fn();
vi.mock('@/app/hooks/useGatedOpenTab', () => ({
  useGatedOpenTab: () => ({
    openTab: mockOpenTab,
    showUpgradeModal: false,
    dismissUpgradeModal: mockDismissUpgradeModal,
    gateFeature: 'tabs.unlimited' as const,
  }),
}));

const mockSyncRecentSet = vi.fn();
vi.mock('@/app/hooks/useSyncRecentSet', () => ({
  useSyncRecentSet: () => mockSyncRecentSet,
}));

vi.mock('@/app/store/recent-sets', () => ({
  addRecentSet: vi.fn(),
}));

describe('useOpenSet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens tab, adds to recents, and navigates when allowed', async () => {
    mockOpenTab.mockReturnValue(true);
    const { result } = renderHook(() => useOpenSet());

    act(() => {
      result.current.openSet({
        setNumber: '75192-1',
        name: 'Millennium Falcon',
        year: 2017,
        imageUrl: null,
        numParts: 7541,
        themeId: 158,
        themeName: 'Star Wars',
      });
    });

    expect(mockOpenTab).toHaveBeenCalledWith({
      type: 'set',
      id: '75192-1',
      setNumber: '75192-1',
      name: 'Millennium Falcon',
      imageUrl: null,
      numParts: 7541,
      year: 2017,
      themeId: 158,
      themeName: 'Star Wars',
    });
    expect(mockSyncRecentSet).toHaveBeenCalledWith('75192-1');
    expect(mockPush).toHaveBeenCalledWith('/sets?active=75192-1');

    const { addRecentSet } = await import('@/app/store/recent-sets');
    expect(addRecentSet).toHaveBeenCalledWith(
      expect.objectContaining({
        setNumber: '75192-1',
        name: 'Millennium Falcon',
      })
    );
  });

  it('does not navigate when tab limit is exceeded', () => {
    mockOpenTab.mockReturnValue(false);
    const { result } = renderHook(() => useOpenSet());

    act(() => {
      result.current.openSet({
        setNumber: '75192-1',
        name: 'Millennium Falcon',
        year: 2017,
        imageUrl: null,
        numParts: 7541,
        themeId: null,
        themeName: null,
      });
    });

    expect(mockOpenTab).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/hooks/__tests__/useOpenSet.test.ts`
Expected: FAIL — `useOpenSet` module not found

- [ ] **Step 3: Implement useOpenSet hook**

```typescript
// app/hooks/useOpenSet.ts
'use client';

import { useGatedOpenTab } from '@/app/hooks/useGatedOpenTab';
import { useSyncRecentSet } from '@/app/hooks/useSyncRecentSet';
import { addRecentSet } from '@/app/store/recent-sets';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type OpenSetParams = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
};

export function useOpenSet() {
  const router = useRouter();
  const { openTab, showUpgradeModal, dismissUpgradeModal, gateFeature } =
    useGatedOpenTab();
  const syncRecentSet = useSyncRecentSet();

  const openSet = useCallback(
    (params: OpenSetParams) => {
      const { setNumber, name, year, imageUrl, numParts, themeId, themeName } =
        params;

      const allowed = openTab({
        type: 'set',
        id: setNumber,
        setNumber,
        name,
        imageUrl,
        numParts,
        year,
        themeId,
        themeName,
      });

      addRecentSet({
        setNumber,
        name,
        year,
        imageUrl,
        numParts,
        themeId,
        themeName,
      });
      syncRecentSet(setNumber);

      if (allowed) {
        router.push(`/sets?active=${encodeURIComponent(setNumber)}`);
      }
    },
    [openTab, syncRecentSet, router]
  );

  return { openSet, showUpgradeModal, dismissUpgradeModal, gateFeature };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/hooks/__tests__/useOpenSet.test.ts`
Expected: PASS

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/hooks/useOpenSet.ts app/hooks/__tests__/useOpenSet.test.ts
git commit -m "feat: extract useOpenSet hook from SetPageRedirector"
```

---

### Task 2: Update SetDisplayCard default href

Change the default link target from `/sets/{setNumber}` to `/sets?active={setNumber}` so in-app card clicks go directly to the inventory SPA.

**Files:**

- Modify: `app/components/set/SetDisplayCard.tsx:169`

- [ ] **Step 1: Update href in SetDisplayCard**

In `app/components/set/SetDisplayCard.tsx`, line 169, change:

```tsx
href={`/sets/${encodeURIComponent(setNumber)}`}
```

to:

```tsx
href={`/sets?active=${encodeURIComponent(setNumber)}`}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/set/SetDisplayCard.tsx
git commit -m "feat: SetDisplayCard links to inventory SPA instead of set page"
```

---

### Task 3: Update SetDetailModal — add "Set Overview" button and useOpenSet

Replace the simple href-based "Open Set" button with the `useOpenSet` hook, and add a "Set Overview" link. Add `activeSetNumber` prop to hide "Open Set" when already on that set's inventory.

**Files:**

- Modify: `app/components/set/SetDetailModal.tsx`
- Reference: `app/hooks/useOpenSet.ts`

- [ ] **Step 1: Update SetDetailModal**

In `app/components/set/SetDetailModal.tsx`:

a) Add imports:

```tsx
import { UpgradeModal } from '@/app/components/upgrade-modal';
import { useOpenSet } from '@/app/hooks/useOpenSet';
import { Eye } from 'lucide-react';
```

b) Add `activeSetNumber` prop to the type (line 12-22):

```tsx
type SetDetailModalProps = {
  open: boolean;
  onClose: () => void;
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  year?: number | undefined;
  numParts?: number | undefined;
  themeId?: number | null | undefined;
  themeName?: string | null | undefined;
  /** When set, hides "Open Set" if this matches setNumber (already on that inventory). */
  activeSetNumber?: string | null;
};
```

c) Inside the component, add the hook call after existing hooks:

```tsx
const { openSet, showUpgradeModal, dismissUpgradeModal, gateFeature } =
  useOpenSet();
const isCurrentSet =
  activeSetNumber != null &&
  activeSetNumber.toLowerCase() === setNumber.toLowerCase();
```

d) Replace the "Open Set CTA" section (lines 228-239) with:

```tsx
{
  /* CTA buttons */
}
<div className="flex flex-col gap-2 border-t-2 border-subtle p-3">
  <Button
    href={`/sets/${encodeURIComponent(setNumber)}`}
    variant="secondary"
    size="md"
    className="w-full"
  >
    <Eye className="size-4" />
    Set Overview
  </Button>
  {!isCurrentSet && (
    <Button
      variant="primary"
      size="md"
      className="w-full"
      onClick={() => {
        onClose();
        openSet({
          setNumber,
          name: setName,
          year: year ?? 0,
          imageUrl,
          numParts: numParts ?? 0,
          themeId: themeId ?? null,
          themeName: themeName ?? null,
        });
      }}
    >
      Open Set
      <ArrowRight className="size-4" />
    </Button>
  )}
</div>;
```

e) Add UpgradeModal as a sibling after `</Modal>` (not nested inside it). Wrap the return in a fragment `<>...</>`:

```tsx
<>
  <Modal open={open} onClose={onClose} title={setName}>
    {/* ... existing modal content ... */}
  </Modal>
  <UpgradeModal
    open={showUpgradeModal}
    feature={gateFeature}
    onClose={dismissUpgradeModal}
  />
</>
```

- [ ] **Step 2: Update SetTopBar to pass activeSetNumber**

In `app/components/nav/SetTopBar.tsx`, the `SetDetailModal` is rendered at line 711-721. Add `activeSetNumber={setNumber}`:

```tsx
<SetDetailModal
  open={setDetailModalOpen}
  onClose={() => setSetDetailModalOpen(false)}
  setNumber={setNumber}
  setName={setName}
  imageUrl={resolvedImageUrl}
  year={year}
  numParts={numParts}
  themeId={themeId}
  themeName={themeName}
  activeSetNumber={setNumber}
/>
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/components/set/SetDetailModal.tsx app/components/nav/SetTopBar.tsx
git commit -m "feat: SetDetailModal adds Set Overview button and useOpenSet integration"
```

---

### Task 4: Add "Set Overview" and "Share" to kebab menu

Add new dropdown items to `SetOwnershipAndCollectionsRow` when in dropdown variant.

**Files:**

- Modify: `app/components/set/SetOwnershipAndCollectionsRow.tsx`

- [ ] **Step 1: Add new props and dropdown items**

In `app/components/set/SetOwnershipAndCollectionsRow.tsx`:

a) Add import:

```tsx
import { Eye, Link as LinkIcon } from 'lucide-react';
```

(Note: `Check, ExternalLink, List` are already imported)

b) Add `setNumber` prop to the type (line 16-22):

```tsx
type SetOwnershipAndCollectionsRowProps = {
  ownership: SetOwnershipState;
  variant?: 'default' | 'inline' | 'dropdown';
  className?: string;
  bricklinkUrl?: string | null;
  rebrickableUrl?: string | null;
  /** Required in dropdown variant to build overview/share links. */
  setNumber?: string;
};
```

c) Destructure `setNumber` in component params (line 24-30).

d) Add share handler and toast state inside the component:

```tsx
const [copiedToast, setCopiedToast] = useState(false);

useEffect(() => {
  if (!copiedToast) return;
  const timer = setTimeout(() => setCopiedToast(false), 2000);
  return () => clearTimeout(timer);
}, [copiedToast]);

const handleShare = () => {
  if (!setNumber) return;
  const url = `${window.location.origin}/sets/${encodeURIComponent(setNumber)}`;
  void navigator.clipboard?.writeText(url);
  setCopiedToast(true);
};
```

e) After the Rebrickable `MoreDropdownButton` (line 147-155), add:

```tsx
{
  variant === 'dropdown' && setNumber && (
    <MoreDropdownButton
      icon={<Eye className="size-4" />}
      label="Set Overview"
      href={`/sets/${encodeURIComponent(setNumber)}`}
    />
  );
}
{
  variant === 'dropdown' && setNumber && (
    <MoreDropdownButton
      icon={<LinkIcon className="size-4" />}
      label="Share"
      onClick={handleShare}
    />
  );
}
```

f) Add a share toast portal after the existing mobile toast portal (around line 194):

```tsx
{
  copiedToast &&
    createPortal(
      <Toast
        description="Link copied to clipboard"
        variant="success"
        onClose={() => setCopiedToast(false)}
      />,
      document.body
    );
}
```

- [ ] **Step 2: Pass setNumber from SetTopBar**

In `app/components/nav/SetTopBar.tsx`, update the `SetOwnershipAndCollectionsRow` at line 315-319:

```tsx
<SetOwnershipAndCollectionsRow
  ownership={ownership}
  variant="dropdown"
  bricklinkUrl={bricklinkSetUrl}
  rebrickableUrl={rebrickableSetUrl}
  setNumber={setNumber}
/>
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/components/set/SetOwnershipAndCollectionsRow.tsx app/components/nav/SetTopBar.tsx
git commit -m "feat: add Set Overview and Share to kebab dropdown menu"
```

---

### Task 5: Add onClick support to PublicSetCard

Allow `PublicSetCard` to open a modal instead of direct-linking, matching the `SetDisplayCard` pattern.

**Files:**

- Modify: `app/components/set/PublicSetCard.tsx`

- [ ] **Step 1: Add onClick prop**

In `app/components/set/PublicSetCard.tsx`:

a) Add `onClick` to the type (line 10-18):

```tsx
export type PublicSetCardProps = {
  setNumber: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number | null;
  themeLabel?: string | null;
  className?: string;
  /** When provided, fires callback instead of navigating (for modal-first flow). */
  onClick?: () => void;
};
```

b) Destructure `onClick` in the component params.

c) Extract the card body (lines 64-93) into a variable, then conditionally wrap (matching SetDisplayCard pattern at lines 159-174):

```tsx
const cardBody = (
  <>
    <div className="p-2">
      {/* ... existing image section ... */}
    </div>
    <div className="flex items-start gap-2 px-2 py-3 sm:px-3">
      {/* ... existing text section ... */}
    </div>
  </>
);

return (
  <div className={cn('group relative flex flex-col', cardVariants({...}), className)}>
    {onClick ? (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-1 cursor-pointer flex-col text-left"
      >
        {cardBody}
      </button>
    ) : (
      <Link
        href={`/sets/${encodeURIComponent(setNumber)}`}
        className="flex w-full flex-1 flex-col"
      >
        {cardBody}
      </Link>
    )}
  </div>
);
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/set/PublicSetCard.tsx
git commit -m "feat: add onClick support to PublicSetCard for modal-first flow"
```

---

### Task 6: Update PartDetailClient to use modal-first flow

Change the set list on the part detail page from direct links to opening `SetDetailModal`.

**Files:**

- Modify: `app/parts/[partNum]/PartDetailClient.tsx`
- Reference: `app/components/identify/IdentifySetListItem.tsx` (pattern)

- [ ] **Step 1: Read current PartDetailClient set list section**

Read `app/parts/[partNum]/PartDetailClient.tsx` and find the set list rendering (around line 160-180). Understand the data shape for each set entry.

- [ ] **Step 2: Add modal state and SetDetailModal import**

Add `SetDetailModal` import:

```tsx
import { SetDetailModal } from '@/app/components/set/SetDetailModal';
```

(`useState` is already imported on line 3.)

Add state near top of component:

```tsx
const [modalSet, setModalSet] = useState<{
  setNumber: string;
  name: string;
  imageUrl: string | null;
  year?: number;
} | null>(null);
```

Note: The `SetMeta` type (line 21-26) only has `set_num`, `name`, `year`, `image_url` — no `numParts`, `themeId`, or `themeName`. The modal will show these fields as `undefined`/omitted, which it already handles gracefully (shows "—" for missing data). This is acceptable for the discovery context.

- [ ] **Step 3: Replace Link with button in set grid**

Replace the set grid rendering (lines 170-201). Change each `<Link>` to a `<button>` that opens the modal:

```tsx
<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
  {filteredSets.map(set => (
    <li key={set.set_num}>
      <button
        type="button"
        onClick={() =>
          setModalSet({
            setNumber: set.set_num,
            name: set.name ?? set.set_num,
            imageUrl: set.image_url,
            year: set.year ?? undefined,
          })
        }
        className="group flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-subtle bg-card text-left transition-shadow hover:shadow-md"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-background-muted">
          {set.image_url ? (
            <OptimizedImage
              src={set.image_url}
              alt={set.name ?? set.set_num}
              variant="setCard"
              className="object-contain p-2 transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <ImagePlaceholder variant="fill" />
          )}
        </div>
        <div className="p-2">
          <p className="truncate text-xs font-semibold text-foreground">
            {set.name ?? set.set_num}
          </p>
          <p className="font-mono text-2xs text-foreground-muted">
            {set.set_num}
            {set.year != null && ` · ${set.year}`}
          </p>
        </div>
      </button>
    </li>
  ))}
</ul>
```

- [ ] **Step 4: Render SetDetailModal at end of component JSX**

Add before the closing `</div>` of the component's return:

```tsx
{
  modalSet && (
    <SetDetailModal
      open={!!modalSet}
      onClose={() => setModalSet(null)}
      setNumber={modalSet.setNumber}
      setName={modalSet.name}
      imageUrl={modalSet.imageUrl}
      year={modalSet.year}
    />
  );
}
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/parts/[partNum]/PartDetailClient.tsx
git commit -m "feat: PartDetailClient uses modal-first flow for set links"
```

---

### Task 7: Add part detail link to InventoryItemModal

Add a "Part details" link to the inventory item modal for non-minifig parts, matching the existing minifig detail link pattern.

**Files:**

- Modify: `app/components/set/items/InventoryItemModal.tsx`

- [ ] **Step 1: Add part detail link**

In `app/components/set/items/InventoryItemModal.tsx`, in the external links section (lines 309-348), after the Rebrickable link, add a part detail link for non-minifig items. The existing minifig link is at lines 339-347.

After the minifig detail link block, add:

```tsx
{
  !isFigId && row.partId && (
    <Link
      href={`/parts/${encodeURIComponent(row.partId)}`}
      className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-theme-text transition-colors hover:bg-card-muted"
      onClick={e => e.stopPropagation()}
    >
      Part details →
    </Link>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/set/items/InventoryItemModal.tsx
git commit -m "feat: add part detail link to inventory item modal"
```

---

## Chunk 2: Set Overview Page — Server & Client Components

### Task 8: Create lightweight inventory stats query

Add a function to get unique parts/colors counts without loading the full inventory pipeline.

**Files:**

- Modify: `app/lib/catalog/sets.ts`
- Create: `app/lib/catalog/__tests__/sets-stats.test.ts`

- [ ] **Step 1: Write test for getSetInventoryStats**

```typescript
// app/lib/catalog/__tests__/sets-stats.test.ts
import { describe, it, expect, vi } from 'vitest';

// Since this queries Supabase, we'll test the function signature
// and mock the database. Integration testing against real DB
// happens via the dev server.
describe('getSetInventoryStats', () => {
  it('should be exported from catalog/sets', async () => {
    const mod = await import('../sets');
    expect(typeof mod.getSetInventoryStats).toBe('function');
  });
});
```

- [ ] **Step 2: Implement getSetInventoryStats**

Add to `app/lib/catalog/sets.ts`:

```typescript
/**
 * Lightweight inventory stats — unique parts and colors counts.
 *
 * Supabase PostgREST doesn't support COUNT(DISTINCT) directly.
 * We select only the two narrow columns we need (part_num, color_id)
 * and count distinct values in JS. For the largest sets (~7500 parts)
 * this is a few hundred KB transfer — acceptable compared to the full
 * inventory pipeline which loads images, identities, rarity, etc.
 */
export async function getSetInventoryStats(setNumber: string): Promise<{
  uniqueParts: number;
  uniqueColors: number;
} | null> {
  const supabase = getCatalogReadClient();

  // Find the latest inventory version for this set
  const { data: inv } = await supabase
    .from('rb_inventories')
    .select('id')
    .eq('set_num', setNumber)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inv) return null;

  // Select only the two columns needed for counting.
  // Filter is_spare=false to match getSetInventoryLocal behavior.
  const { data: parts } = await supabase
    .from('rb_inventory_parts_public')
    .select('part_num, color_id')
    .eq('inventory_id', inv.id)
    .eq('is_spare', false);

  if (!parts || parts.length === 0) return null;

  const uniqueParts = new Set(parts.map(p => p.part_num)).size;
  const uniqueColors = new Set(parts.map(p => p.color_id)).size;

  return { uniqueParts, uniqueColors };
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- --run app/lib/catalog/__tests__/sets-stats.test.ts`
Expected: PASS

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Export from catalog index if one exists**

Check if `app/lib/catalog/index.ts` exists and re-exports. If so, add `getSetInventoryStats` to the exports.

- [ ] **Step 6: Commit**

```bash
git add app/lib/catalog/sets.ts app/lib/catalog/__tests__/sets-stats.test.ts
git commit -m "feat: add lightweight getSetInventoryStats query"
```

---

### Task 9: Create related sets query and API route

Query `rb_sets` by `theme_id` with year-proximity sorting and pagination.

**Files:**

- Create: `app/lib/catalog/relatedSets.ts`
- Create: `app/api/sets/[setNumber]/related/route.ts`

- [ ] **Step 1: Create relatedSets catalog function**

```typescript
// app/lib/catalog/relatedSets.ts
import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

export type RelatedSet = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
};

/**
 * Fetches sets sharing the same theme_id, sorted by year proximity
 * to the reference set, excluding the reference set itself.
 */
export async function getRelatedSets(
  themeId: number,
  referenceSetNumber: string,
  referenceYear: number,
  limit: number = 8,
  offset: number = 0
): Promise<{ sets: RelatedSet[]; total: number }> {
  const supabase = getCatalogReadClient();

  // Fetch sets in this theme, capped at 200 to avoid unbounded queries.
  // theme_id on rb_sets is the leaf subtheme, so most themes are small.
  // We fetch all matching rows (up to cap) for client-side year-proximity sorting.
  const { data, count } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, num_parts, image_url', { count: 'exact' })
    .eq('theme_id', themeId)
    .neq('set_num', referenceSetNumber)
    .order('year', { ascending: false })
    .limit(200);

  const total = count ?? data?.length ?? 0;

  if (!data || data.length === 0) return { sets: [], total: 0 };

  // Sort by year proximity to reference set, then name
  const sorted = data.sort((a, b) => {
    const distA = Math.abs((a.year ?? 0) - referenceYear);
    const distB = Math.abs((b.year ?? 0) - referenceYear);
    if (distA !== distB) return distA - distB;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  const page = sorted.slice(offset, offset + limit);

  return {
    sets: page.map(row => ({
      setNumber: row.set_num,
      name: row.name ?? '',
      year: row.year ?? 0,
      numParts: row.num_parts ?? 0,
      imageUrl: row.image_url ?? null,
    })),
    total,
  };
}
```

- [ ] **Step 2: Create API route for pagination**

```typescript
// app/api/sets/[setNumber]/related/route.ts
import 'server-only';

import { getRelatedSets } from '@/app/lib/catalog/relatedSets';
import { getSetSummaryLocal } from '@/app/lib/catalog/sets';
import { NextResponse, type NextRequest } from 'next/server';

type RouteParams = {
  setNumber: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { setNumber } = await params;
  const url = request.nextUrl;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 8, 24);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  // Accept themeId/year as query params to avoid redundant summary lookup
  // on pagination requests (client already has this data from the initial SSR).
  const qThemeId = Number(url.searchParams.get('themeId'));
  const qYear = Number(url.searchParams.get('year'));

  let themeId: number | null = Number.isFinite(qThemeId) ? qThemeId : null;
  let year = Number.isFinite(qYear) ? qYear : 0;

  // Fallback: fetch summary if params not provided (e.g., direct API call)
  if (themeId == null) {
    const summary = await getSetSummaryLocal(setNumber).catch(() => null);
    if (!summary || summary.themeId == null) {
      return NextResponse.json({ sets: [], total: 0 });
    }
    themeId = summary.themeId;
    year = summary.year;
  }

  const result = await getRelatedSets(themeId, setNumber, year, limit, offset);

  return NextResponse.json(result);
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/lib/catalog/relatedSets.ts app/api/sets/[setNumber]/related/route.ts
git commit -m "feat: add related sets query and API route"
```

---

### Task 10: Create set overview client component

Build the client component that renders the overview page content with interactive elements.

**Files:**

- Create: `app/components/set/SetOverviewClient.tsx`
- Reference: `app/components/minifig/MinifigPageClient.tsx` (layout pattern)
- Reference: `app/components/set/SetDetailModal.tsx` (stats grid pattern)

- [ ] **Step 1: Create SetOverviewClient**

Create `app/components/set/SetOverviewClient.tsx`. This is a large component — follow the MinifigPageClient structure:

```typescript
'use client';

import { MinifigCard } from '@/app/components/minifig/MinifigCard';
import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { Button } from '@/app/components/ui/Button';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { UpgradeModal } from '@/app/components/upgrade-modal';
import { useOpenSet } from '@/app/hooks/useOpenSet';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import type { RelatedSet } from '@/app/lib/catalog/relatedSets';
import { formatCurrency } from '@/app/lib/utils/formatCurrency';
import { getBricklinkSetUrl, getRebrickableSetUrl } from '@/app/lib/utils/externalUrls';
import {
  ArrowRight,
  DollarSign,
  ExternalLink,
  Info,
  Palette,
  Puzzle,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicSetCard } from './PublicSetCard';

type SetMinifigDisplay = {
  figNum: string;
  name: string | null;
  imageUrl: string | null;
  numParts: number | null;
  quantity: number;
};

type SetOverviewClientProps = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
  uniqueParts: number | null;
  uniqueColors: number | null;
  minifigs: SetMinifigDisplay[];
  initialRelatedSets: RelatedSet[];
  relatedSetsTotal: number;
};

type PriceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; total: number | null; currency: string | null }
  | { status: 'error' };

export function SetOverviewClient({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
  themeName,
  uniqueParts,
  uniqueColors,
  minifigs,
  initialRelatedSets,
  relatedSetsTotal,
}: SetOverviewClientProps) {
  const { openSet, showUpgradeModal, dismissUpgradeModal, gateFeature } =
    useOpenSet();
  const ownership = useSetOwnershipState({
    setNumber,
    name,
    imageUrl,
    year,
    numParts,
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

  // Price fetch
  const [priceState, setPriceState] = useState<PriceState>({ status: 'idle' });
  const priceFetched = useRef(false);

  useEffect(() => {
    if (priceFetched.current) return;
    priceFetched.current = true;

    setPriceState({ status: 'loading' });
    fetch('/api/prices/bricklink-set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setNumber }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { total: number | null; currency: string | null }) => {
        setPriceState({
          status: 'loaded',
          total: data.total,
          currency: data.currency,
        });
      })
      .catch(() => {
        setPriceState({ status: 'error' });
      });
  }, [setNumber]);

  // Related sets pagination
  const [relatedSets, setRelatedSets] = useState(initialRelatedSets);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMoreRelated = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: '8',
        offset: String(relatedSets.length),
        ...(themeId != null ? { themeId: String(themeId) } : {}),
        ...(year ? { year: String(year) } : {}),
      });
      const res = await fetch(
        `/api/sets/${encodeURIComponent(setNumber)}/related?${params}`
      );
      if (res.ok) {
        const data = (await res.json()) as { sets: RelatedSet[] };
        setRelatedSets(prev => [...prev, ...data.sets]);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [setNumber, themeId, year, relatedSets.length, loadingMore]);

  const handleOpenSet = () => {
    openSet({
      setNumber,
      name,
      year,
      imageUrl,
      numParts,
      themeId,
      themeName,
    });
  };

  const bricklinkSetUrl = getBricklinkSetUrl(setNumber);
  const rebrickableSetUrl = getRebrickableSetUrl(setNumber);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-xl border-2 border-subtle bg-card shadow-md">
        <div className="aspect-4/3 w-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              width={600}
              height={450}
              className="size-full object-contain p-6 drop-shadow-md"
              priority
            />
          ) : (
            <ImagePlaceholder variant="fill" />
          )}
        </div>

        {/* Identity */}
        <div className="border-t-2 border-subtle px-5 py-4">
          {themeName && (
            <div className="mb-1 text-xs font-bold tracking-wide text-theme-text uppercase">
              {themeName}
            </div>
          )}
          <h1 className="text-xl font-bold leading-tight lg:text-2xl">
            {name}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {setNumber}
            {' · '}
            {year}
            {' · '}
            {numParts} pieces
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle">
          {/* Price cell */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <DollarSign className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Used Price</div>
              {priceState.status === 'loaded' && priceState.total != null ? (
                <div className="text-sm font-medium">
                  {formatCurrency(priceState.total, priceState.currency)}
                </div>
              ) : priceState.status === 'loading' ||
                priceState.status === 'idle' ? (
                <div className="text-sm text-foreground-muted">Loading…</div>
              ) : (
                <div className="text-sm text-foreground-muted">Unavailable</div>
              )}
            </div>
          </div>

          {/* Inventory stats cell */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <Info className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Inventory</div>
              {uniqueParts != null && uniqueColors != null ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Puzzle className="size-3 text-foreground-muted" />
                    {uniqueParts} unique parts
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Palette className="size-3 text-foreground-muted" />
                    {uniqueColors} colors
                  </div>
                </div>
              ) : (
                <div className="text-sm text-foreground-muted">—</div>
              )}
            </div>
          </div>
        </div>

        {/* External links */}
        <div className="flex gap-px border-t-2 border-subtle bg-subtle">
          <a
            href={bricklinkSetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            BrickLink
            <ExternalLink className="size-3.5" />
          </a>
          <a
            href={rebrickableSetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            Rebrickable
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Ownership row — inline variant matches MinifigPageClient pattern */}
        <div className="border-t-2 border-subtle px-3 py-2">
          <SetOwnershipAndCollectionsRow ownership={ownership} variant="inline" />
        </div>

        {/* Open Set CTA */}
        <div className="border-t-2 border-subtle p-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleOpenSet}
          >
            Open Set
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Minifigures section */}
      {minifigs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">
            Minifigures ({minifigs.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {minifigs.map(fig => (
              <MinifigCard
                key={fig.figNum}
                figNum={fig.figNum}
                name={fig.name ?? 'Unknown'}
                numParts={fig.numParts ?? 0}
                quantity={fig.quantity}
                imageUrl={fig.imageUrl}
              />
            ))}
          </div>
        </section>
      )}

      {/* Parts Summary section
          Note: rarity distribution (e.g., "12 parts in fewer than 5 sets")
          is deferred — requires loading full inventory rarity data which
          conflicts with the lightweight approach. Can be added later. */}
      {uniqueParts != null && uniqueColors != null && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Parts Summary</h2>
          <div className="rounded-xl border-2 border-subtle bg-card p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{numParts}</div>
                <div className="text-xs text-foreground-muted">Total Pieces</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{uniqueParts}</div>
                <div className="text-xs text-foreground-muted">Unique Parts</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{uniqueColors}</div>
                <div className="text-xs text-foreground-muted">Colors</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Related Sets section */}
      {relatedSets.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Related Sets</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {relatedSets.map(set => (
              <PublicSetCard
                key={set.setNumber}
                setNumber={set.setNumber}
                name={set.name}
                year={set.year}
                imageUrl={set.imageUrl}
                numParts={set.numParts}
              />
            ))}
          </div>
          {relatedSets.length < relatedSetsTotal && (
            <div className="mt-4 text-center">
              <Button
                variant="secondary"
                size="md"
                onClick={() => void loadMoreRelated()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </section>
      )}

      <UpgradeModal
        open={showUpgradeModal}
        feature={gateFeature}
        onClose={dismissUpgradeModal}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/set/SetOverviewClient.tsx
git commit -m "feat: create SetOverviewClient component"
```

---

### Task 11: Replace set page with overview server component

Transform `/sets/[setNumber]/page.tsx` from a redirector to a full overview page.

**Files:**

- Modify: `app/sets/[setNumber]/page.tsx`
- Reference: `app/minifigs/[figNum]/page.tsx` (pattern)

- [ ] **Step 1: Rewrite the set page server component**

Replace the contents of `app/sets/[setNumber]/page.tsx`:

```typescript
import { PageLayout } from '@/app/components/layout/PageLayout';
import { SetOverviewClient } from '@/app/components/set/SetOverviewClient';
import { getSetSummaryLocal } from '@/app/lib/catalog';
import { getSetMinifigsLocal, getBlMinifigImageUrl, findRbMinifigsByBlIds } from '@/app/lib/catalog/minifigs';
import { getRelatedSets } from '@/app/lib/catalog/relatedSets';
import { getSetInventoryStats } from '@/app/lib/catalog/sets';
import { getSetSummary } from '@/app/lib/rebrickable';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type RouteParams = {
  setNumber: string;
};

type SetPageProps = {
  params: Promise<RouteParams>;
};

export async function generateMetadata({
  params,
}: SetPageProps): Promise<Metadata> {
  const { setNumber } = await params;
  if (!setNumber) {
    return { title: 'Set Not Found | Brick Party' };
  }

  const summary =
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
    (await getSetSummary(setNumber).catch(() => null));

  if (!summary) {
    return { title: 'Set Not Found | Brick Party' };
  }

  return {
    title: `${summary.name} (${summary.setNumber}) — Brick Party`,
    description: `View ${summary.name} (${summary.setNumber}) — ${summary.numParts} pieces, ${summary.year}. Browse parts, minifigures, and related sets.`,
  };
}

export default async function SetPage({ params }: SetPageProps) {
  const { setNumber } = await params;
  if (!setNumber) notFound();

  const summary =
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
    (await getSetSummary(setNumber).catch(() => null));

  if (!summary) notFound();

  // Parallel data fetching for overview content
  const [stats, rawMinifigs, relatedResult] = await Promise.all([
    getSetInventoryStats(summary.setNumber).catch(() => null),
    getSetMinifigsLocal(summary.setNumber).catch(() => []),
    summary.themeId != null
      ? getRelatedSets(summary.themeId, summary.setNumber, summary.year).catch(
          () => ({ sets: [], total: 0 })
        )
      : Promise.resolve({ sets: [], total: 0 }),
  ]);

  // Enrich minifigs with names and images (batch lookup, not N+1)
  const figIds = rawMinifigs.map(f => f.figNum);
  const rbMinifigMap = figIds.length > 0
    ? await findRbMinifigsByBlIds(figIds).catch(() => new Map())
    : new Map();

  const minifigs = rawMinifigs.map(fig => {
    const rbMinifig = rbMinifigMap.get(fig.figNum) ?? null;
    return {
      figNum: fig.figNum,
      name: rbMinifig?.name ?? null,
      imageUrl: rbMinifig?.bl_minifig_id
        ? getBlMinifigImageUrl(rbMinifig.bl_minifig_id)
        : null,
      numParts: rbMinifig?.num_parts ?? null,
      quantity: fig.quantity,
    };
  });

  return (
    <PageLayout>
      <SetOverviewClient
        setNumber={summary.setNumber}
        name={summary.name}
        year={summary.year}
        imageUrl={summary.imageUrl}
        numParts={summary.numParts}
        themeId={summary.themeId}
        themeName={summary.themeName}
        uniqueParts={stats?.uniqueParts ?? null}
        uniqueColors={stats?.uniqueColors ?? null}
        minifigs={minifigs}
        initialRelatedSets={relatedResult.sets}
        relatedSetsTotal={relatedResult.total}
      />
    </PageLayout>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors (may need adjustments based on exact export names)

- [ ] **Step 3: Verify page renders in dev**

Navigate to a known set URL like `/sets/75192-1` in the dev server and verify:

- Overview page renders with hero image, stats, CTA
- "Open Set" button works (adds to tabs, navigates to SPA)
- Price loads
- Minifigs section shows (for sets with minifigs)
- Related sets section shows (for sets with theme siblings)

- [ ] **Step 4: Commit**

```bash
git add app/sets/[setNumber]/page.tsx
git commit -m "feat: replace set page redirector with overview page"
```

---

### Task 12: Clean up SetPageRedirector

Remove the now-unused `SetPageRedirector` component.

**Files:**

- Delete: `app/components/set/SetPageRedirector.tsx`

- [ ] **Step 1: Verify no remaining imports**

Search for `SetPageRedirector` in the codebase to confirm it's only imported by the old set page (which was just replaced).

Run: `grep -r "SetPageRedirector" app/`

Expected: No results (the old import in `app/sets/[setNumber]/page.tsx` was removed in Task 11).

- [ ] **Step 2: Delete SetPageRedirector**

```bash
rm app/components/set/SetPageRedirector.tsx
```

- [ ] **Step 3: Optionally delete SetStatusMenu (dead code)**

Verify `SetStatusMenu` is unused:
Run: `grep -r "SetStatusMenu" app/`

If no imports found, delete: `rm app/components/set/SetStatusMenu.tsx`

- [ ] **Step 3b: Check if SetPageSkeleton is still needed**

Verify `SetPageSkeleton` is still imported elsewhere after removing `SetPageRedirector`:
Run: `grep -r "SetPageSkeleton" app/`

If only the deleted `SetPageRedirector` imported it, delete: `rm app/components/set/SetPageSkeleton.tsx`

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove unused SetPageRedirector and SetStatusMenu"
```

---

## Chunk 3: Integration Testing & Polish

### Task 13: End-to-end verification

Manually verify all navigation flows work correctly.

- [ ] **Step 1: Verify overview page**

Navigate to `/sets/75192-1` — should show overview page (not redirect).

- [ ] **Step 2: Verify "Open Set" from overview**

Click "Open Set" on overview — should add to tabs and navigate to `/sets?active=75192-1`.

- [ ] **Step 3: Verify in-app set cards**

From the sets landing page, click a set card — should go directly to `/sets?active={setNumber}` (inventory), not to overview.

- [ ] **Step 4: Verify SetDetailModal**

Open SetDetailModal from search results — should show "Set Overview" and "Open Set" buttons. Both should work.

- [ ] **Step 5: Verify SetDetailModal from inventory**

On the inventory page, click the set thumbnail — modal should show "Set Overview" but NOT "Open Set" (already on that set).

- [ ] **Step 6: Verify kebab menu**

On inventory page, open kebab menu — should show "Set Overview" and "Share" options. "Share" copies URL to clipboard.

- [ ] **Step 7: Verify part detail page**

On a part detail page, click a set in the "Sets containing this part" list — should open SetDetailModal.

- [ ] **Step 8: Verify inventory item modal**

On inventory page, click a part — modal should show "Part details →" link for non-minifig parts.

- [ ] **Step 9: Verify related sets pagination**

On an overview page with many related sets, click "Show more" — should load additional sets.

- [ ] **Step 10: Run linting and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "feat: set overview pages complete"
```
