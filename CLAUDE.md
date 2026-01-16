# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memory Bank

Context resets between sessions. The Memory Bank in `./memory/` is the link to previous work — read it at the start of every task.

### Core Files

| File                 | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `project-brief.md`   | Foundation: core requirements, goals, scope (source of truth) |
| `product-context.md` | Why this exists, problems solved, UX goals                    |
| `tech-context.md`    | Stack, setup, constraints, dependencies                       |
| `system-patterns.md` | Architecture, technical decisions, design patterns            |
| `active-context.md`  | Current focus, recent changes, next steps, active decisions   |
| `progress.md`        | What works, what's left, current status, known issues         |

### When to Update Memory Bank

- After implementing significant changes
- When discovering new project patterns
- When context needs clarification
- When user requests **"update memory bank"** → review ALL files, focus on `active-context.md` and `progress.md`

## Documentation Structure

Beyond the memory bank, project documentation lives in `docs/`:

```
docs/
├── BACKLOG.md                 # Master task list (High/Medium/Low priority)
├── billing/
│   └── stripe-subscriptions.md   # Stripe integration spec
└── dev/
    ├── CURRENT_IMPROVEMENT_PLAN.md    # Active improvement work
    ├── PREVIOUS_IMPROVEMENT_PLANS.md  # Historical archive
    ├── *_COMPLETE.md                  # Completion docs (architecture reference)
    └── archive/                       # Completed plans (historical reference)
```

### Documentation Workflow

| Document                               | When to Use                                                |
| -------------------------------------- | ---------------------------------------------------------- |
| `docs/BACKLOG.md`                      | Add new tasks, check outstanding work, mark items complete |
| `docs/dev/CURRENT_IMPROVEMENT_PLAN.md` | Track active improvement initiatives                       |
| `docs/billing/stripe-subscriptions.md` | Stripe implementation details and status                   |
| `memory/active-context.md`             | Current focus and recent completions                       |
| `memory/progress.md`                   | High-level status, references BACKLOG.md                   |

### When Planning New Work

1. Check `docs/BACKLOG.md` for existing related tasks
2. For major features, create a plan in `docs/dev/` (e.g., `FEATURE_NAME_PLAN.md`)
3. When complete, rename to `*_COMPLETE.md` or move plan to `docs/dev/archive/`
4. Update `docs/BACKLOG.md` to mark tasks complete
5. Update `memory/active-context.md` with completion summary

## Collaboration Guidelines

- **Challenge and question**: Don't immediately agree with requests that seem suboptimal or unclear
- **Push back constructively**: Suggest better alternatives with clear reasoning
- **Think critically**: Consider edge cases, performance, maintainability before implementing
- **Seek clarification**: Ask follow-up questions when requirements are ambiguous
- **Propose improvements**: Suggest better patterns or cleaner implementations when appropriate

## Project Overview

Brick Party is a Next.js web app for LEGO set piece tracking. Users enter a set number, view the parts inventory, mark owned quantities, compute missing pieces, and export lists compatible with Rebrickable CSV and BrickLink wanted list formats.

## Commands

```bash
# Development
npm run dev           # Start dev server (assume already running; don't auto-start)
npm run build         # Production build
npm run lint          # ESLint check
npm run format        # Prettier + ESLint fix
npm run format:check  # Check formatting without fixing

# Testing
npm test              # Run all tests (Vitest, watch mode)
npm test -- --run     # Run tests once without watch
npm test path/to/file.test.ts   # Run a single test file

# Supabase
npm run generate-types   # Regenerate TypeScript types from Supabase schema

# Data ingestion (scripts)
npm run ingest:rebrickable   # Ingest Rebrickable CSV catalog into Supabase
```

## Architecture

### Service Layer Pattern

- **Route handlers** (`app/api/`): HTTP concerns only — validation, auth, response formatting, rate limiting
- **Services** (`app/lib/services/`): Business logic orchestration, no HTTP types
- **Data access** (`app/lib/catalog/`, `app/lib/rebrickable/`): External API/DB calls
- **Domain** (`app/lib/domain/`): Shared types, guards, error helpers

### State Management

- **TanStack Query**: Server data (inventories, prices, search results)
- **Zustand** (`app/store/`): UI state and per-set owned quantities (in-memory cache)
- **Dexie/IndexedDB** (`app/lib/localDb/`): Local-first persistence for catalog cache and owned data
- **Supabase**: Auth, user data, catalog tables (`rb_*`), group sessions

### Key Patterns

- All server-side modules import `server-only` to prevent client bundling
- Use `getCatalogReadClient()` for anon-readable tables, `getCatalogWriteClient()` for service-role tables (see `app/lib/db/catalogAccess.ts`)
- Use `logger` from `@/lib/metrics` for all logging (no raw `console.*` in production)
- `null` = intentional absence; `undefined` = not loaded yet; use `??` not `||` for defaults

### SSR vs Client

- SSR used for: layout/theme, account page, user sets hydration, pricing preferences, group host actions
- Client-only for: catalog/search/inventory flows (auth-agnostic), owned state, filters

## Code Quality Standards

### Pure Functions & DRY

- **Extract shared utilities** — eliminate duplication between components
- **Prefer pure functions** — stateless, testable, no side effects
- **Shared utility pattern**: `utils/` or co-located helpers for common logic
- **Type safety** — comprehensive TypeScript interfaces and type guards
- **Error isolation** — individual failures don't break batch operations

### Code Organization

- **Focused modules** — each concern handled by dedicated files
- **Interface extraction** — shared types in dedicated files (`types.ts`, `app/lib/domain/`)
- **Batch processing** — prefer efficient algorithms over N+1 patterns
- **Consistent naming** — clear separation of concerns

## Tailwind V4

This project uses Tailwind CSS v4. Key differences from v3:

### Direct Theme Variable References

Theme variables defined in `@theme` blocks in `globals.css` can be referenced directly in class names without bracket notation:

```css
/* In globals.css */
@theme {
  --color-theme-primary: #016cb8;
  --color-theme-shadow: color-mix(
    in oklch,
    var(--color-theme-primary) 70%,
    black
  );
  --radius-lg: 1rem;
}
```

```tsx
// ❌ Don't use bracket notation for theme variables
<div className="bg-[var(--color-theme-primary)] rounded-[var(--radius-lg)]" />

// ✅ Reference theme variables directly (strip --color- or --radius- prefix)
<div className="bg-theme-primary rounded-lg" />
```

### Custom Utilities

Use `@utility` directive for custom utility classes in `globals.css`:

```css
@utility container-wide {
  max-width: var(--container-wide);
  margin-inline: auto;
}
```

### Custom Variants

Use `@custom-variant` for custom variant selectors:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

## Database Migrations

All schema changes must use Supabase CLI migrations — no hand-created files or dashboard-only edits:

```bash
supabase migration new <name>   # Create migration file (you write SQL)
supabase db diff -f <name>      # Auto-generate from schema changes
supabase db reset               # Reset local DB from migrations
supabase migration up           # Apply new migrations without reset
supabase db push                # Deploy to remote
```

Emergency dashboard changes must be followed by `supabase db pull` / `supabase db diff` to restore migration parity.

## Testing

Tests live in `__tests__/` directories alongside source files. Vitest with jsdom environment. Use `describe`/`it` blocks with standard Jest matchers.

Path alias `@/*` maps to project root in both app code and tests.

### Browser Automation Setup

Chrome is installed in WSL for browser automation via the Chrome DevTools MCP.

**To launch Chrome for testing** (Claude should run this automatically):

```bash
google-chrome --remote-debugging-port=9222 --headless=new --disable-gpu --no-sandbox &
```

Or for **visible browser** (when you want to watch):

```bash
google-chrome --remote-debugging-port=9222 --no-sandbox &
```

## Key Directories

- `app/api/` — Next.js Route Handlers (thin HTTP layer)
- `app/lib/services/` — Business logic (search, inventory, pricing, identify)
- `app/lib/localDb/` — Dexie schema and IndexedDB operations
- `app/store/` — Zustand stores (owned, pinned, recent-sets, user-sets)
- `app/components/` — React components (UI primitives in `ui/`, feature components elsewhere)
- `supabase/migrations/` — Database migrations
- `scripts/` — Data ingestion and mapping scripts
- `memory/` — Project memory bank (context for AI assistants)

## External APIs

- **Rebrickable**: Canonical LEGO catalog (CSV ingestion + live API fallback)
- **BrickLink**: Price guide, minifig mappings, subset/superset data
- **Brickognize**: Image-based part identification
- **Supabase**: Auth (Google), Postgres, Realtime for group builds

## Important Constraints

- Never expose API keys client-side (all external calls via Route Handlers)
- New Supabase tables must enable RLS in the creating migration
- Prefer catalog-backed queries over live API calls to minimize rate limit pressure
- Inventory tables are virtualized; heavy calculations go in view-model hooks, not leaf components
