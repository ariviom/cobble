# Tech Context

## Stack Overview

- Next.js App Router (TypeScript, React) deployed to Netlify (via OpenNext).
- UI built with Tailwind CSS and shadcn/ui component primitives.
- Data fetching and caching via TanStack Query; local client state via Zustand.
- Supabase (Postgres + Auth + Realtime) as the primary backend for catalog data, user data, and group sessions.
- External providers:
  - Rebrickable for the canonical LEGO catalog and inventories (both live API and bulk CSV downloads).
  - BrickLink for price guide data, per-set minifig subsets, and subset/superset information.
  - Brickognize for image-based part identification.

## Architectural Philosophy

- **Server-only secrets**: API keys for Rebrickable, BrickLink, and Brickognize live only in Route Handlers and scripts; the client never sees them.
- **Local-first UX**: unauthenticated users keep owned quantities and filters in `localStorage`; authenticated users sync that state to Supabase without breaking offline-ish behavior.
- **Read-optimized catalog**: Rebrickable CSV downloads are periodically ingested into Supabase `rb_*` tables via `npm run ingest:rebrickable` (locally) and a scheduled CI job in production.
- **Thin HTTP layer**: Next.js Route Handlers act as adapters to Supabase and external APIs, with most domain logic living in `app/lib/*`.
- **Typed boundaries**: Supabase `Database` types and shared helpers (for example, `AppError`, `throwAppErrorFromResponse`) enforce consistent, type-safe calls across layers.

## Development Setup

- Create `.env.local` with:
  - `REBRICKABLE_API` for live Rebrickable API calls (when not served from the catalog).
  - Supabase URL and anon / service-role keys for local auth, catalog ingestion, and scripts.
  - BrickLink and Brickognize credentials for pricing and Identify flows.
- Run the app with `npm run dev`; keep ingestion tooling separate via `npm run ingest:rebrickable`.

## Key Constraints

- **Performance**: show inventory within ~3 seconds for sets ≤ 1000 parts (with a visible loading state).
- **Rate limits**: prefer catalog-backed queries and caching to minimize live Rebrickable/BrickLink calls; never scrape marketplaces.
- **Security & privacy**: Google via Supabase is the only auth; Rebrickable and BrickLink remain data providers, not identity.
- **MVP scope**: auth and Supabase persistence are layered on; core search/inventory/export flows must continue to work for anonymous users.