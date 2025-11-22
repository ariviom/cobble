# Tech Context

## Technologies Used

- Next.js (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query (React Query)
- Zustand
- Next.js Route Handlers (server-only Rebrickable access)
 - Custom domain helpers (`AppError`, `throwAppErrorFromResponse`) for consistent error handling.

## Development Setup

- Create `.env` with `REBRICKABLE_API` set to the Rebrickable API key.
- Run locally for MVP; deployment ignored for now.
- Server-only calls to Rebrickable via Route Handlers; client never sees the key.

## Technical Constraints

- Performance: show inventory within 3 seconds for sets ≤ 1000 parts; include loading spinner.
- No auth; no analytics; offline not supported in MVP. Supabase-backed simple auth is the next planned phase.
- Rate limits: respect Rebrickable limits; cache server responses with a sensible revalidate window.
- No scraping of BrickLink or other marketplaces.

## Dependencies

- Next.js, React, TypeScript
- Tailwind CSS, shadcn/ui
- @tanstack/react-query
- Zustand
- CSV generation utility (custom or library)
- ID mapping data for Rebrickable ↔ BrickLink
- BrickLink pricing endpoint under `/api/prices/bricklink` used by the manual "Get prices" flow.