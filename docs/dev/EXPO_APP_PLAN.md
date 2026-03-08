# Expo Native App Plan

**Created:** March 7, 2026
**Status:** Research complete, awaiting implementation
**Goal:** Ship Brick Party to iOS and Android app stores via Expo/React Native while keeping the Next.js web app untouched.

---

## Approach: Separate Native App with Shared Business Logic

The Next.js web app stays as-is. A new Expo app shares ~60% of the codebase (domain types, business logic, state contracts, validation) while maintaining its own native UI layer. The 39 existing API route handlers serve both web and mobile clients over HTTP.

### Why not a WebView wrapper (Capacitor)?

- App uses SSR extensively (root layout auth, entitlements, theme resolution) which is incompatible with Capacitor's static export mode
- Apple increasingly rejects "website in a wrapper" apps
- Live-URL mode requires internet and offers nothing over PWA
- SSR removal would be a 3-4 week refactor that risks breaking the working web app

### Why not shared UI components?

- **NativeWind v4** (stable): Only supports Tailwind v3 — our app uses Tailwind v4
- **NativeWind v5**: Supports Tailwind v4 but is pre-release ("not intended for production use")
- **UniWind**: Supports Tailwind v4 but web output requires Vite, not Next.js
- **React Strict DOM**: Meta's cross-platform primitive layer — promising but early-stage
- **Fundamental blocker**: Web renders `<div>/<span>/<button>`, React Native renders `<View>/<Text>/<Pressable>`. Sharing JSX requires either rewriting the web app onto React Native Web or waiting for React Strict DOM maturity.
- **Revisit when** NativeWind v5 goes stable or React Strict DOM is production-ready.

---

## Monorepo Structure

**Tool:** Turborepo + pnpm workspaces

- Lightweight config, fast caching, first-class Next.js + Expo support
- Expo SDK 52+ auto-detects monorepos (no Metro config needed)
- Not Nx — adds unnecessary complexity for a small team and has known friction with Expo

```
brick-party/
├── apps/
│   ├── web/                          # Existing Next.js app (moved here)
│   │   ├── app/                      # Same structure as today
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mobile/                       # New Expo app
│       ├── app/                      # Expo Router (file-based routing)
│       │   ├── (tabs)/               # Tab navigator
│       │   │   ├── sets.tsx
│       │   │   ├── collection.tsx
│       │   │   ├── search.tsx
│       │   │   ├── identify.tsx
│       │   │   └── account.tsx
│       │   ├── sets/[setNumber].tsx
│       │   ├── login.tsx
│       │   └── _layout.tsx
│       ├── components/               # Native UI components
│       ├── app.json
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── shared/                       # Core business logic
│   │   ├── domain/                   # partIdentity, errors, guards, limits
│   │   ├── types/                    # Search, inventory, store types
│   │   ├── services/                 # Pure logic: sanitization, filtering, batching
│   │   ├── stores/                   # Store types + pure state logic
│   │   ├── validation/               # Zod schemas
│   │   ├── config/                   # imageSizes, timing constants
│   │   ├── utils/                    # throttle, users, theme resolution
│   │   ├── persistence/              # StorageLike interface
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── design-tokens/                # Single source of design truth
│   │   ├── colors.ts                 # Theme colors, semantic colors, brand palette
│   │   ├── spacing.ts                # Spacing scale, nav heights, container widths
│   │   ├── typography.ts             # Font sizes, weights, line heights
│   │   ├── variants.ts              # CVA variant configs (shared prop types)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                       # Shared tooling config
│       ├── eslint/
│       └── typescript/
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## Shared Code Extraction

### Tier 1: Move as-is (zero refactoring needed)

Pure TypeScript with no browser, server, or framework imports. Can move immediately.

| Current path                     | Shared path                     | Contents                                               |
| -------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `app/lib/domain/partIdentity.ts` | `shared/domain/partIdentity.ts` | Canonical key factories, parsers (~180 lines)          |
| `app/lib/domain/errors.ts`       | `shared/domain/errors.ts`       | AppError class, error codes (~80 lines)                |
| `app/lib/domain/guards.ts`       | `shared/domain/guards.ts`       | Type guards: isRecord, hasProperty, etc. (~50 lines)   |
| `app/lib/domain/inventoryKey.ts` | `shared/domain/inventoryKey.ts` | parseInventoryKey for bl:/fig: prefixes (~40 lines)    |
| `app/lib/domain/limits.ts`       | `shared/domain/limits.ts`       | FREE_TAB_LIMIT, FREE_LIST_LIMIT (~20 lines)            |
| `app/lib/domain/user.ts`         | `shared/domain/user.ts`         | UserId, User, UserPreferences types (~30 lines)        |
| `app/types/search.ts`            | `shared/types/search.ts`        | SearchResult, FilterType, SortOption, etc. (~60 lines) |
| `app/lib/users.ts`               | `shared/utils/users.ts`         | USERNAME_REGEX, buildUserHandle (~30 lines)            |
| `app/config/imageSizes.ts`       | `shared/config/imageSizes.ts`   | Image size config constants (~40 lines)                |
| `app/config/timing.ts`           | `shared/config/timing.ts`       | SYNC_INTERVAL_MS, batch sizes (~30 lines)              |
| `app/lib/utils/throttle.ts`      | `shared/utils/throttle.ts`      | RequestThrottler class (~60 lines)                     |
| `app/lib/persistence/storage.ts` | `shared/persistence/storage.ts` | `StorageLike` interface (~30 lines, interface only)    |

**Total: ~650 lines. Effort: 1-2 days.**

### Tier 2: Extract with interface refactoring

Files that contain both portable pure logic and web-specific code. Split each file.

#### Store types and pure state logic

For each store, extract the type definitions and pure algorithms. Zustand store creation + browser event listeners stay in the web app.

| Store                        | Extractable                                                                              | Stays in web                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `store/owned.ts`             | OwnedCache type, PendingWrite type, microtask batching algorithm, write coalescing logic | Zustand store, beforeunload/visibilitychange listeners, IndexedDB calls |
| `store/pinned.ts`            | PinnedState type, serialization/deserialization                                          | Zustand store, localStorage persistence                                 |
| `store/recent-sets.ts`       | RecentSet type, sorting/capacity-limiting functions                                      | readStorage/writeStorage calls                                          |
| `store/recent-searches.ts`   | RecentSearchEntry type, dedup/sort logic                                                 | Storage calls                                                           |
| `store/recent-identifies.ts` | Same pattern                                                                             | Same                                                                    |
| `store/user-sets.ts`         | Set metadata types, merge algorithm                                                      | Zustand store, Supabase hydration                                       |
| `store/group-sessions.ts`    | Session types, age-based expiry logic                                                    | Storage calls                                                           |
| `store/open-tabs.ts`         | Tab types (SetTab, LandingTab), tab state types                                          | Zustand store, cross-tab sync                                           |

#### Pure service functions

| Service                          | Extractable functions                                                                               | Stays in web                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `services/search.ts`             | `sanitizeSearchQuery()`, `applyFilter()`                                                            | `searchSetsPage()` (Supabase queries)       |
| `services/identityResolution.ts` | `resolveCatalogPartIdentity()`, `resolveMinifigParentIdentity()`, `resolveMinifigSubpartIdentity()` | `buildResolutionContext()` (needs Supabase) |
| `services/pricing.ts`            | PriceRequestItem/PriceResponseEntry types, batching algorithm                                       | `fetchBricklinkPrices()` (needs BL OAuth)   |
| `services/billing.ts`            | Tier enum, feature flag types                                                                       | Stripe integration                          |

#### Pure hook logic

| Hook                          | Extractable                                              | Stays          |
| ----------------------------- | -------------------------------------------------------- | -------------- |
| `hooks/useCompletionStats.ts` | `mergeLocalAndCloud()` (~60 lines, pure merge algorithm) | The React hook |

#### LocalDb type definitions

| File                | Extractable                                                              | Stays                           |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `localDb/schema.ts` | 15+ type defs (CatalogSet, CatalogPart, LocalOwned, SyncQueueItem, etc.) | Dexie class, table declarations |

**Prerequisite refactor:** Move `InventoryRow` type from `app/components/set/types` to `packages/shared/types/inventory.ts`. This is the one hidden dependency where localDb imports from the component layer.

**Total Tier 2: ~1,500 lines extracted + ~500 lines of adapter interfaces. Effort: 5-7 days.**

### Tier 3: Stays in web app (no extraction)

| Category                | Files                                                                                                        | Why                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Server-only services    | identify, inventory, minifigMapping, priceCache, billing, entitlements, usageCounters, imageBackfill, themes | Import `server-only`, use Supabase service role, BL OAuth |
| API clients             | `rebrickable/client.ts`, `bricklink.ts`                                                                      | `server-only`; mobile calls same API routes over HTTP     |
| React hooks             | All 45+ hooks                                                                                                | React + Supabase + IndexedDB integration                  |
| Zustand store shells    | The `create()` calls                                                                                         | React-bound                                               |
| SyncWorker              | `SyncWorker.ts`                                                                                              | beforeunload, visibilitychange, tab coordination          |
| LocalDb implementations | ownedStore, catalogCache, syncQueue, metaStore                                                               | Dexie-specific                                            |

---

## Expo App Architecture

### Backend

The mobile app calls the deployed web API (`https://brickparty.app/api/*`) for all backend operations. No backend extraction or duplication needed. The 39 existing route handlers serve both platforms.

### Auth

| Web (current)                                | Mobile (new)                                  |
| -------------------------------------------- | --------------------------------------------- |
| Supabase cookie-based SSR auth               | `@supabase/supabase-js` + `expo-secure-store` |
| Middleware refreshes session on each request | Client-side token refresh                     |
| PKCE flow via `/api/auth/callback`           | `expo-auth-session` for Google OAuth          |

### Local Storage

| Web (current)                  | Mobile (new)                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Dexie/IndexedDB                | `expo-sqlite`                                                                |
| localStorage (via StorageLike) | `@react-native-async-storage/async-storage` (via same StorageLike interface) |

### Styling

| Web (current)                                      | Mobile (new)                                         |
| -------------------------------------------------- | ---------------------------------------------------- |
| Tailwind CSS v4 (standard)                         | UniWind (Tailwind v4 for React Native)               |
| `globals.css` with @theme/@utility/@custom-variant | UniWind CSS file consuming shared design tokens      |
| CVA + cn() for variant composition                 | Same CVA + cn() pattern, different className targets |

### Navigation

| Web (current)            | Mobile (new)                                   |
| ------------------------ | ---------------------------------------------- |
| Next.js App Router       | Expo Router (file-based, structurally similar) |
| Chrome-style tab bar     | Native tab navigator                           |
| `next/link`, `useRouter` | Expo Router `<Link>`, `useRouter`              |

### Native-Specific Features

| Feature            | Implementation                                                |
| ------------------ | ------------------------------------------------------------- |
| Camera (Identify)  | `expo-camera` (better than browser mediaDevices)              |
| Push notifications | `expo-notifications`                                          |
| Haptics            | `expo-haptics` (on owned toggle, completion)                  |
| Share/export       | Native share sheet via `expo-sharing`                         |
| Deep links         | Universal Links (iOS) / App Links (Android) for `/join/:slug` |
| App Store billing  | In-app purchase for Plus tier (Apple/Google require this)     |

---

## Feature Development Workflow

For features that touch both platforms:

```
1. Shared logic (packages/shared/)          Write once
   - Types, validation, pure algorithms

2. API route (apps/web/app/api/)            Write once (mobile calls same endpoint)
   - Route handler with Supabase query

3. Web UI (apps/web/)                       Write for web
   - HTML elements + Tailwind v4

4. Mobile UI (apps/mobile/)                 Write for native
   - RN elements + UniWind
```

### Effort multiplier by feature type

| Feature type           | Example                | Shared % | Multiplier           |
| ---------------------- | ---------------------- | -------- | -------------------- |
| Business logic fix     | Minifig cascade bug    | 100%     | 1x                   |
| New API + data feature | Price history chart    | 50-60%   | ~1.4x                |
| New UI feature         | Confetti on completion | 30%      | ~1.5x                |
| UI-only polish         | Redesign set card      | 0%       | 2x (but small scope) |

### Platform-specific features

| Feature                | Web             | Mobile                    |
| ---------------------- | --------------- | ------------------------- |
| Chrome-style tabs      | Yes             | No (native stack nav)     |
| CSV file download      | Yes             | Share sheet               |
| Camera identify        | Browser API     | Native camera (better UX) |
| Landing/marketing page | Yes             | N/A                       |
| Push notifications     | No              | Yes                       |
| Haptic feedback        | No              | Yes                       |
| Billing                | Stripe checkout | In-app purchase           |

---

## Migration Sequence

### Phase 0: Monorepo scaffold (1 day)

- Move existing app to `apps/web/`
- Create `pnpm-workspace.yaml`, `turbo.json`, root `package.json`
- Create `packages/shared/` with `tsconfig.json`
- Verify `turbo dev` runs the web app unchanged

### Phase 1: Extract Tier 1 shared code (1-2 days)

- Move domain types, config, utils to `packages/shared/`
- Update web app imports to `@brick-party/shared/*`
- Run tests — nothing should break

### Phase 2: Unblock hidden dependency (1 day)

- Move `InventoryRow` type from `app/components/set/types` to `packages/shared/types/inventory.ts`
- Fix `catalogCache.ts` import

### Phase 3: Extract Tier 2 shared code (3-5 days)

- Extract store types and pure state logic
- Extract pure service functions
- Create `StorageLike` adapter interfaces
- Extract localDb type definitions

### Phase 4: Expo app — navigation shell (2 weeks)

- Scaffold Expo app with Expo Router
- Wire up auth (Supabase + expo-secure-store)
- Build 5-tab navigation shell
- Basic search + set detail (calling web API)

### Phase 5: Expo app — core features (2 weeks)

- Inventory view with owned tracking (expo-sqlite)
- Export via share sheet
- Collection page

### Phase 6: Expo app — advanced features (2 weeks)

- Identify (expo-camera)
- Search Party
- Pricing display
- Account/billing (in-app purchase)

### Phase 7: Polish and submission (1-2 weeks)

- Push notifications
- Haptic feedback
- TestFlight / Play Store internal testing
- App Store submission

**Total: ~2 weeks refactoring + ~7-8 weeks Expo development.**

---

## Design Token Sharing

Single source of truth for colors, spacing, and typography. Web generates CSS variables; native generates UniWind theme config.

```typescript
// packages/design-tokens/colors.ts
export const brandColors = {
  yellow: '#f2d300',
  red: '#e3000b',
  blue: '#016cb8',
  green: '#00b242',
  orange: '#fe7000',
  purple: '#4d2f93',
} as const;

export const semanticColors = {
  danger: brandColors.red,
  success: brandColors.green,
  warning: brandColors.orange,
  info: brandColors.blue,
} as const;

// Web: consumed by globals.css @theme block
// Native: consumed by UniWind theme config
```

---

## Key Decisions

| Decision             | Choice                       | Rationale                                     |
| -------------------- | ---------------------------- | --------------------------------------------- |
| Native framework     | Expo / React Native          | True native app, App Store approval, best UX  |
| Monorepo tool        | Turborepo + pnpm             | Lightest config, best Expo/Next.js support    |
| Mobile styling       | UniWind                      | Production-ready Tailwind v4 for React Native |
| Component sharing    | Tokens + logic only, not JSX | Tooling not ready; web stays untouched        |
| Backend for mobile   | Existing Next.js API routes  | No duplication; mobile calls same endpoints   |
| Mobile local storage | expo-sqlite + AsyncStorage   | Replaces Dexie/IndexedDB + localStorage       |
| Mobile auth          | Supabase + expo-secure-store | Token-based instead of cookie-based           |

---

## Related Documentation

- `docs/billing/stripe-subscriptions.md` — Billing spec (mobile will need IAP variant)
- `docs/dev/DERIVED_PRICING_PLAN.md` — Pricing system (mobile consumes same API)
- `CLAUDE.md` — Architecture overview and coding standards
