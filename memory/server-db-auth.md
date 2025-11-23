## Server, Database, and Auth Architecture

### High-Level Stack

- **Runtime**: Next.js App Router, deployed to Netlify (via OpenNext under the hood).
- **Primary Backend**: Supabase (managed Postgres + Auth + Realtime).
- **External APIs**:
  - Rebrickable: canonical LEGO catalog and inventories, accessed via API and bulk CSV downloads.
  - BrickLink: pricing and subset/superset data only; never used as an identity provider.

### Responsibilities by Layer

- **Next.js app (this repo)**:
  - UI, routing, and client/server components.
  - Route Handlers as thin HTTP APIs that:
    - Talk to Supabase for user data, preferences, owned quantities, and group sessions.
    - Talk to Rebrickable/BrickLink via server-only wrappers in `app/lib` when we need external data.
  - No direct calls to Rebrickable/BrickLink from the client.

- **Supabase (Postgres + Auth + Realtime)**:
  - **Catalog schema** (internal copy of Rebrickable data):
    - `rb_sets` — set metadata (set_num, name, year, theme_id, num_parts, image_url, etc.).
    - `rb_parts` — part metadata (part_num, name, part_cat_id, image_url, etc.).
    - `rb_set_parts` — set inventories (set_num, part_num, color_id, quantity, is_spare).
    - `rb_themes`, `rb_colors` — supporting lookup tables.
  - **User & app data**:
    - `users` (optional profile layer on top of Supabase `auth.users`).
    - `user_preferences` — per-user UI and behavior flags (theme, default filters, etc.).
    - `user_owned_sets` — high-level per-set metadata: whether the user owns/wants/can-build.
    - `user_owned_rows` — per-set, per-inventory-row owned quantities keyed by set + inventory key.
  - **Group-build / “search together”**:
    - `group_sessions` — sessions for collaborative builds (id, host_user_id, set_number, created_at, is_active).
    - `group_session_participants` — optional table for tracking participants (session_id, user_id nullable, joined_at, display_name, role).
    - (Optional) `group_session_events` if we want to persist a log of edits over time.
  - **Auth**:
    - Google OAuth as primary identity provider (via Supabase Auth).
    - No login via Rebrickable or BrickLink; they remain data APIs only.
  - **Realtime**:
    - Supabase Realtime channels (Postgres → websockets) for group-build sessions.
    - Channel name derived from `group_sessions.id`.

### External APIs and Identity

- **Rebrickable**:
  - API key-based authentication only (no OAuth/SSO).
  - Has a notion of `user_token` for accessing a user’s collection, but this is not a general login mechanism; we treat it as a future optional “connect your Rebrickable collection” feature, not core auth.
  - Bulk download CSVs from the Downloads page to build the internal catalog, per their own guidance for bulk usage.

- **BrickLink**:
  - OAuth 1.0a for API access; intended for stores and API clients, not as a generic SSO provider.
  - Used only for:
    - Price guide data for parts/minifigs.
    - Superset/subset listings for the Identify flow.
  - Not used as an identity provider or login.

### Catalog Strategy (Rebrickable)

- We maintain our own **read-optimized catalog** in Supabase, refreshed from Rebrickable CSV downloads.
- **Ingestion flow**:
  - Developer runs `npm run ingest:rebrickable` locally to:
    - Download CSVs from Rebrickable Downloads.
    - Bulk load into Supabase `rb_*` tables (upsert/replace).
  - In production, this ingestion will move to a scheduled job (Supabase or CI).
- **Usage in app**:
  - New `lib/catalog.ts` module:
    - `searchSetsLocal`, `getSetInventoryLocal`, `getColorsLocal`, `getThemesLocal`, etc.
  - `lib/rebrickable.ts` and route handlers:
    - Prefer catalog-backed queries (Supabase) when possible.
    - Fall back to live Rebrickable API only when:
      - Data is missing locally, or
      - We explicitly want very recent changes.

### User Data and Preferences

- Authenticated users:
  - Identified by Supabase `auth.users.id`.
  - Per-user rows in:
    - `user_preferences` (UI theme, default filters, “identify defaults”, pricing display options, etc.).
    - `user_owned_sets` (per-set flags like owned / can-build / want-to-build).
    - `user_owned_rows`:
      - Keyed by `(user_id, set_number, inventory_key)`.
      - Stores `owned_quantity` (what we currently keep in localStorage).
  - For now, anonymous users can still use the app with localStorage only; on first Google login we migrate localStorage into Supabase.

### Group Builds / “Search Together”

- A group-build is a **session** tied to a single set:
  - `group_sessions` row created by a host (who must be authenticated).
  - Shareable link includes a session identifier/token.
- **Ownership semantics**:
  - All edits in a session ultimately write into the **host’s** `user_owned_rows`:
    - `OwnedQuantityControl` changes from any participant are broadcast to the session channel.
    - Host’s browser (or a route handler) applies those changes to the host’s owned quantities in Supabase.
  - This means:
    - “Search together” is effectively a shared editor for the host’s set state.
    - The host can reopen the set later and see the final state without rejoining the session.
- **Realtime updates**:
  - Supabase Realtime:
    - Channel name derived from `group_sessions.id`.
    - All participants subscribe; updates are broadcast as `{ inventoryKey, newOwned }` (or similar).
  - Persistence:
    - At minimum, we persist final owned quantities via host’s `user_owned_rows`.
    - Optionally, we can persist events for replay/analytics later.

### Auth and Session Strategy

- **Primary login**:
  - Google OAuth via Supabase Auth.
  - We do not implement custom username/password initially.
- **Session management**:
  - Next.js uses Supabase-provided session handling in server components and route handlers.
  - Client components read auth via a thin client hook (Supabase client or own wrapper).
- **Migration from localStorage**:
  - For anonymous users, owned state remains client-only.
  - On first Google login:
    - Client posts localStorage-owned data to a server route.
    - Server merges into `user_owned_*` for that user.
    - We mark localStorage as “migrated” to avoid duplication.

### Near-Term Implementation Steps

1. **Supabase project setup**:
   - Create project, set env vars in Netlify for Supabase URL and keys.
   - Define core tables and migrations for:
     - `rb_sets`, `rb_parts`, `rb_set_parts`, `rb_themes`, `rb_colors`.
     - `user_preferences`, `user_owned_sets`, `user_owned_rows`.
     - `group_sessions`, `group_session_participants`.
2. **Ingestion tooling**:
   - Implement `npm run ingest:rebrickable` CLI to download and import CSVs into Supabase.
3. **Auth integration**:
   - Add Supabase client integration in Next.js.
   - Expose Google OAuth login/logout flows and basic “you are signed in as …” UI on `/account`.
4. **Account page UI**:
   - Build `/account` page sections for:
     - Auth status (Google identity, connect/disconnect).
     - Preferences (theme, default filters, experimental flags).
     - Data/storage overview (local vs cloud, migration status).
     - Group-build defaults (e.g., default session visibility, host behavior).
5. **Group-build skeleton**:
   - Define route structure and minimal UI for creating/joining sessions.
   - Defer realtime wiring until Supabase Realtime is in place.



