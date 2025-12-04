## BrickLink Pricing Integration Plan (Next.js + Supabase)

This document outlines a plan to replicate the **Minifigapp-style BrickLink pricing architecture** in a **Next.js + Supabase** stack, based on what we observed in the decompiled Android app and its embedded SQLite database.

The core idea: **all BrickLink API traffic and rate limiting are handled server-side**, and the frontend (Next.js) only reads from **pre-aggregated pricing tables** in Supabase.

---

## 1. Goals and Constraints

- **Goals**
  - Store and serve **BrickLink price guide–style data** (6-month average, new/used, sales counts per item/color).
  - **Avoid per-user calls to BrickLink**; all BrickLink usage is centralized.
  - Provide pricing data for **LEGO parts, sets, and minifigs** in your own schema.

- **Constraints / Non-goals**
  - Respect BrickLink **ToS and API rate limits**.
  - No BrickLink credentials or requests from the **browser**; only from trusted server-side code.
  - Use **TypeScript** for all Node/Next.js/Edge code.

---

## 2. High-Level Architecture (Mirroring Minifigapp)

- **Server-side (Supabase + Worker)**
  - Supabase Postgres holds:
    - Core catalog (`items`, `inventory`, `item_colors`).
    - BrickLink price snapshots and aggregates (similar to `t_known_colors`).
    - Metadata like `db_version_id` and `prices_bl_oldest_update`.
  - A **scheduled ingestion worker** (TypeScript) runs periodically:
    - Uses BrickLink API to fetch/refresh price guide data in bulk.
    - Writes into **raw tables**, then into **aggregated tables**.
    - Tracks progress and obeys rate limits.

- **Frontend (Next.js)**
  - Uses Supabase (or your own API routes) to read from **aggregated pricing tables only**.
  - Never calls BrickLink directly; it only sees **your data model**.

- **Optional: Offline snapshot**
  - If you want to fully emulate Minifigapp, you can periodically export a **SQLite / JSON snapshot** from Supabase and distribute it via CDN, but for a web app this is usually not necessary.

---

## 3. Supabase Schema Design

### 3.1 Core Catalog Tables

These mirror the idea of `t_items` and `t_inventory` in the Android DB.

```sql
-- items: canonical representation of a part / set / minifig
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  bmid           text unique not null,  -- BrickMonkey-like internal ID, e.g. 'P_3001'
  element_type   text not null,         -- 'P' (part), 'S' (set), 'M' (minifig), etc.
  bl_id          text not null,         -- BrickLink item ID, derived or stored directly
  name           text not null,
  year_from      int,
  year_to        int,
  theme_id_l0    int,
  theme_id_l1    int,
  theme_id_l2    int,
  has_image      boolean default false
);

create index items_bl_id_idx on public.items (bl_id);
create index items_element_type_idx on public.items (element_type);
```

```sql
-- item_colors: known colors per item (like t_known_colors without price fields)
create table public.item_colors (
  id        bigserial primary key,
  item_id   uuid not null references public.items(id) on delete cascade,
  color_id  int not null,  -- BrickLink color ID

  unique (item_id, color_id)
);

create index item_colors_color_id_idx on public.item_colors (color_id);
```

```sql
-- inventory: how sets/minifigs decompose into parts (similar to t_inventory)
create table public.inventory (
  id              bigserial primary key,
  parent_item_id  uuid not null references public.items(id) on delete cascade,
  child_item_id   uuid not null references public.items(id) on delete cascade,
  color_id        int not null,
  quantity        int not null,
  is_extra        boolean default false,
  is_alternate    boolean default false
);

create index inventory_parent_idx on public.inventory (parent_item_id);
create index inventory_child_idx on public.inventory (child_item_id);
```

### 3.2 BrickLink Raw Price Tables

These tables store **raw or lightly processed BrickLink API responses**, which you can re-aggregate without re-calling the API.

```sql
-- bricklink_raw_price_guide: raw-ish responses keyed by (bl_id, color_id, condition, period)
create table public.bricklink_raw_price_guide (
  id              bigserial primary key,
  bl_id           text not null,
  color_id        int not null,
  condition       text not null check (condition in ('N', 'U')),  -- New / Used
  period          text not null,  -- e.g. '6m'

  currency        text not null default 'USD',

  -- aggregates from BrickLink response
  avg_price       numeric(12, 4),     -- in BrickLink currency
  qty_avg_price   numeric(12, 4),     -- quantity-weighted average
  total_quantity  int,
  num_lots        int,
  num_products    int,

  raw_json        jsonb not null,     -- full original response for debugging
  fetched_at      timestamptz not null default now(),

  unique (bl_id, color_id, condition, period)
);

create index bricklink_raw_price_guide_bl_color_idx
  on public.bricklink_raw_price_guide (bl_id, color_id);
```

### 3.3 Aggregated “Known Colors” Table (Minifigapp-style)

This is your equivalent of `t_known_colors`, the table your frontend will primarily query.

```sql
create table public.item_color_prices (
  id                           bigserial primary key,
  item_id                      uuid not null references public.items(id) on delete cascade,
  color_id                     int not null,

  -- BrickLink-style 6m metrics, in *USD cents* for easy math
  price_qavg_usd_cents_6m_new  int,
  n_sales_6m_new               int,
  price_qavg_usd_cents_6m_used int,
  n_sales_6m_used              int,

  -- Optional: image URLs or other metadata if you want to mirror t_known_colors
  url_img_primary              text,
  url_img_secondary            text,

  last_updated_at              timestamptz not null default now(),

  unique (item_id, color_id)
);

create index item_color_prices_item_color_idx
  on public.item_color_prices (item_id, color_id);
```

### 3.4 Versioning / Metadata Table

Equivalent to `t_key_value` with entries like `prices_bl_oldest_update`.

```sql
create table public.pricing_metadata (
  key        text primary key,
  value      text,
  notes      text
);
```

Example rows:

- `db_version_id = '41'` → “Check bricklink_import_versions in Postgres for more info.”
- `prices_bl_oldest_update = '2025-11-11'` → used to inform users about the oldest data point.

### 3.5 User-Interest Tracking

You likely **do not know up front** how many `(item, color)` combos you will care about. Instead of pre-fetching everything, track **user interest** and let that drive what you maintain.

```sql
create table public.item_interest (
  id              bigserial primary key,
  item_id         uuid not null references public.items(id) on delete cascade,
  color_id        int, -- nullable if you want item-level interest only

  interest_score  numeric not null default 0, -- e.g. decayed view/search count
  last_viewed_at  timestamptz,

  unique (item_id, color_id)
);
```

You will:

- Increment `interest_score` (and update `last_viewed_at`) when:
  - A user searches for an item.
  - A user views a detail page / part of a set.
  - A user adds something to their collection.
- Use `interest_score` to **prioritize which combos get BrickLink updates**.

### 3.6 BrickLink Price Task Queue

Instead of calling BrickLink inline, maintain a **task queue** for `(bl_id, color_id, condition, period)` combos to fetch or refresh:

```sql
create table public.bricklink_price_tasks (
  id              bigserial primary key,
  item_id         uuid references public.items(id) on delete cascade,
  bl_id           text not null,
  color_id        int not null,
  condition       text not null check (condition in ('N','U')),
  period          text not null default '6m',

  source          text not null default 'system'
                  check (source in ('system','user')),

  last_fetched_at timestamptz,
  next_due_at     timestamptz not null,
  priority        int not null default 0, -- user > hot items > cold items
  error_count     int not null default 0,

  unique (bl_id, color_id, condition, period)
);

create index bricklink_price_tasks_next_due_idx
  on public.bricklink_price_tasks (next_due_at, priority desc);
```

This table lets you:

- Push **user-triggered tasks** when someone requests a price that is missing or stale (`source = 'user'`, higher `priority`).
- Maintain **system-triggered background tasks** that keep heavily used combos reasonably fresh.

---

## 4. Ingestion Worker (TypeScript)

You need a **server-side process** that talks to BrickLink and writes to Supabase:

- **Options**
  - Supabase **Edge Function** scheduled with the Supabase Scheduler.
  - A **standalone Node/TypeScript script** running on a cron job (e.g., GitHub Actions, Fly.io, a VM).

### 4.1 Worker Responsibilities

- Authenticate with BrickLink API (OAuth / tokens).
- For each `(bl_id, color_id)` combination you care about:
  - Call the **price guide endpoint** for:
    - New (`condition = 'N'`) and Used (`'U'`).
    - The 6-month window (or windows you choose).
  - Upsert into `bricklink_raw_price_guide`.
- After fetching a batch:
  - **Aggregate** into `item_color_prices`:
    - Convert API currency to **USD** if needed.
    - Multiply by 100 and round to get **USD cents**.
    - Update `price_qavg_usd_cents_6m_new` / `used` and sales counts.
- Maintain `pricing_metadata` entries like `prices_bl_oldest_update` and a `last_full_refresh` timestamp.
- Maintain `bricklink_price_tasks` by:
  - Setting `last_fetched_at = now()` and `next_due_at = now() + refresh_interval`.
  - Increasing/decreasing `priority` based on `item_interest.interest_score` and `source`.
- When user requests hit items with **missing or stale** prices:
  - Upsert a `bricklink_price_tasks` row with `source = 'user'`, higher `priority`, and `next_due_at = now()`.
  - Optionally perform an **immediate fetch** if there is remaining user-facing budget for the current day (see below).

### 4.2 Daily Request Budget and User vs Background Split

Introduce **environment-configured daily budgets** so you never exceed BrickLink’s 5,000 requests/day and can reserve some capacity for user-triggered work:

```env
BRICKLINK_DAILY_TOTAL_BUDGET=5000           # hard cap; respect BrickLink ToS
BRICKLINK_DAILY_USER_BUDGET=1000           # reserved for user-triggered updates
# derived at runtime: background budget = total - user
```

At runtime (in your worker):

- Read these values from `process.env`.
- Keep **per-day counters** (e.g., in a `bricklink_request_counters` table or in a small KV store) for:
  - `used_user_requests`
  - `used_background_requests`
- Enforce:
  - `used_user_requests <= BRICKLINK_DAILY_USER_BUDGET`
  - `used_user_requests + used_background_requests <= BRICKLINK_DAILY_TOTAL_BUDGET`

Scheduling:

- **User-triggered path** (e.g., Next.js API when a user queries an item):
  - First, try to serve from `item_color_prices`.
  - If missing or stale:
    - Upsert a `bricklink_price_tasks` job with `source = 'user'`, high `priority`, `next_due_at = now()`.
    - If `used_user_requests < BRICKLINK_DAILY_USER_BUDGET`, the worker may execute this job **immediately** (or in a near-real-time loop) and return fresh data or tell the user “updating price, check back in a few seconds.”
- **Background path** (nightly/daily cron):
  - Select from `bricklink_price_tasks` where `next_due_at <= now()` and `source = 'system'`, ordered by `priority` and `next_due_at`, limiting by the remaining **background budget**.
  - Use `item_interest` to regularly recompute priorities so high-interest items are refreshed more often.

### 4.3 Rate Limiting Strategy

- Introduce a **rate-limited HTTP client** in TypeScript:

```ts
// pseudo-code sketch
type BrickLinkClientOptions = {
  maxRequestsPerMinute: number;
};

export class BrickLinkClient {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private readonly maxPerMinute: number;

  constructor(opts: BrickLinkClientOptions) {
    this.maxPerMinute = opts.maxRequestsPerMinute;
    setInterval(() => this.drain(), 60_000);
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  private async drain() {
    const allowed = this.maxPerMinute;
    for (let i = 0; i < allowed && this.queue.length > 0; i++) {
      const job = this.queue.shift();
      if (!job) break;
      // Fire-and-forget; errors flow back via the Promise from enqueue
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      job();
    }
  }
}
```

- Always respect BrickLink’s documented quotas:
  - Set `maxRequestsPerMinute` conservatively.
  - Handle HTTP `429` and back off (exponential backoff).

### 4.4 Incremental vs Full Refresh

- **Initial backfill**:
  - Iterate over all items/colors of interest and fetch price guide data once.
  - This can take hours/days depending on item count and limits; run as a one-off batch.

- **Incremental updates**:
  - Daily or hourly cron:
    - Re-fetch only items that have changed recently (e.g., based on BrickLink change feeds if available, or a rolling window).
  - Maintain a `bricklink_import_versions` or `bricklink_import_runs` table:
    - Tracks which batches ran, how many items updated, errors, etc.

---

## 5. Using the Data from Next.js

### 5.1 Server-Side Queries (Recommended)

In Next.js **server components** or **Route Handlers**, query Supabase for `item_color_prices`:

```ts
// app/api/prices/[itemId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(
  _req: Request,
  { params }: { params: { itemId: string } }
) {
  const { data, error } = await supabase
    .from('item_color_prices')
    .select(
      'color_id, price_qavg_usd_cents_6m_new, n_sales_6m_new, price_qavg_usd_cents_6m_used, n_sales_6m_used'
    )
    .eq('item_id', params.itemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prices: data });
}
```

### 5.2 UI Usage

- Convert cents to formatted currency in React components.
- Optionally show:
  - “Prices updated as of **X days ago**” using `pricing_metadata.prices_bl_oldest_update`.
  - Confidence metrics (e.g., “based on 60 used sales in last 6 months”).

---

## 6. How This Avoids BrickLink Rate Limits

- **Only the ingestion worker** speaks to BrickLink:
  - Centralized, schedulable, and monitored.
  - Easy to cap request rate and implement backoff.
- Next.js clients and all end users only call **your Supabase/Postgres data**:
  - No BrickLink keys in the browser.
  - No risk that traffic spikes from users translate into BrickLink API spikes.
- This mirrors the Minifigapp pattern:
  - Their Android app reads a **pre-aggregated SQLite** (`t_known_colors`, `t_key_value` with `prices_bl_oldest_update`).
  - Your web app instead reads **Supabase tables** that play the same role.

---

## 7. Optional: Exporting a Snapshot (SQLite / JSON)

If you later want a local/offline snapshot (e.g., for a mobile app or offline-capable web client):

- Periodically run a **snapshot job**:
  - SELECT from `items`, `inventory`, `item_colors`, `item_color_prices`, `pricing_metadata`.
  - Write into a SQLite file (or a versioned JSON bundle).
- Store the snapshot in **Supabase Storage or a CDN**.
- Clients can download and cache this snapshot, just like Minifigapp’s `update_pack_001.upd`.

---

## 8. Next Steps

1. **Finalize schema** in Supabase (using the DDL above as a starting point).
2. Implement a **minimal BrickLink client** in TypeScript with strict rate limiting.
3. Build an **initial backfill script** to populate `bricklink_raw_price_guide` and `item_color_prices`.
4. Wire up a **scheduled job** (Supabase Edge function or external cron) for incremental updates.
5. Add **Next.js server routes** that read from `item_color_prices` and surface prices to your UI.

This gives you a BrickLink-aware pricing layer similar in spirit to Minifigapp, but tailored for a Next.js + Supabase web stack.

---

## 9. Optional Pro Feature: Bring Your Own BrickLink Key (BYOK)

For **pro users who want near-realtime data**, you can offer a BYOK mode where each user supplies their own BrickLink API credentials. This shifts rate limits to the user’s own key while keeping your default, snapshot-based system for everyone else.

### 9.1 High-Level Approach

- **Default path (no BYOK)**: use the existing architecture:
  - Read from `item_color_prices` and `bricklink_raw_price_guide` populated by your shared worker and budgets.
- **Pro path (BYOK)**:
  - A pro user enters their BrickLink OAuth credentials in your app.
  - You **store these credentials encrypted server-side** and never expose them again to the browser.
  - When a pro user requests “realtime” data, a Next.js **server route** calls BrickLink with their key, via your backend as a proxy.

### 9.2 Data Model for BYOK

```sql
create table public.user_bricklink_credentials (
  user_id          uuid primary key references auth.users(id) on delete cascade,

  -- Encrypted blobs; never exposed directly to the client
  consumer_key_enc     bytea not null,
  consumer_secret_enc  bytea not null,
  token_enc            bytea not null,
  token_secret_enc     bytea not null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint user_bricklink_credentials_user_fk
    foreign key (user_id) references auth.users (id)
);
```

**Security notes:**

- Use **row-level security** to ensure:
  - Regular clients cannot `SELECT` from this table at all.
  - Only service-role or dedicated backend roles can read rows.
- Use database-level encryption (e.g. `pgcrypto` / `pgp_sym_encrypt`) or encrypt in your Node layer before insert.

### 9.3 Encryption Strategy

- Have a **single master encryption key** in your backend:
  - Stored in environment (e.g. `BRICKLINK_CREDENTIAL_ENCRYPTION_KEY`) or a dedicated KMS.
  - Never sent to the client.
- On first save:
  - User posts their BrickLink consumer key/secret + token/token secret via HTTPS to a **server-only API route**.
  - Your Next.js route:
    - Validates input / test-calls BrickLink if you want.
    - Encrypts each secret using a strong algorithm (e.g. AES-GCM via Node’s `crypto` or libsodium).
    - Stores encrypted bytes in `user_bricklink_credentials`.
- On use:
  - Server route (with service role) fetches the encrypted row for `user_id`.
  - Decrypts in memory using the master key.
  - Calls BrickLink on behalf of the user, then **discards the plaintext**.

The master key must be rotated carefully; you can include a `key_version` column on the credentials to support re-encryption later.

### 9.4 API Design for Realtime Pro Calls

- Next.js server route, e.g. `app/api/pro/bricklink/price-guide/route.ts`:
  - Authenticates the user and verifies their **pro subscription**.
  - Loads and decrypts the user’s BrickLink credentials.
  - Calls BrickLink price guide endpoints with:
    - Per-user **request counters** and rate limiting.
    - Proper error handling and 429 backoff.
  - Optionally:
    - Writes the latest response into your `bricklink_raw_price_guide` / `item_color_prices` tables **tagged as “user-realtime source”** so subsequent requests can fall back to your DB if their key is removed.

### 9.5 Rate Limits With BYOK

- Each user has their own BrickLink key (and thus their own BrickLink quota).
- You should still:
  - Track per-user usage in a small table, e.g. `user_bricklink_usage (user_id, date, requests_used)`.
  - Enforce a **per-user cap** slightly below BrickLink’s documented daily limit to be safe.
  - Apply short-term throttling (e.g. “no more than X requests per minute”) to prevent abusive spikes.
- Your **shared system budget** (`BRICKLINK_DAILY_TOTAL_BUDGET`) remains for **your own key** and non-BYOK users.
  - BYOK calls **do not count** against that shared budget; they use user-specific keys.

### 9.6 Security Trade-offs and Recommendations

- **Never** call BrickLink directly from the browser with user keys:
  - OAuth 1.0a secrets would be exposed.
  - You cannot trust the client to enforce quotas.
- Treat BrickLink credentials as **password-equivalent**:
  - Provide UI to **revoke/delete** stored keys.
  - Mask values (show only last 4 chars) if you display anything.
  - Log only non-sensitive metadata (e.g. “user stored BrickLink key at time X”).
- Document clearly to pro users:
  - Where their keys are stored (encrypted in your DB).
  - That they can delete them at any time.
  - That rate limits and ToS still apply to their own key.

This BYOK option gives power users access to near-realtime BrickLink data while keeping the core system safe, centralized, and mostly snapshot-driven. For many users you can default to your **aggregated Supabase pricing**, and only fall back to BYOK calls for those who explicitly opt in and understand the trade-offs.
