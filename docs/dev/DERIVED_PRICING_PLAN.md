# Derived Pricing Plan

**Created:** February 17, 2026
**Status:** Planning

---

## Problem

BrickLink's ToS restricts displaying cached price data older than 6 hours. With a 5K daily API limit, even a few hundred users browsing collections would exhaust the quota immediately. We need a strategy that serves pricing data to users while staying within both the ToS and the API budget.

## Current State

Pricing is entirely real-time with no database persistence:

- **In-memory LRU cache** (`app/lib/bricklink.ts`): 500 entries, 30-minute TTL, per-process — lost on deploy/restart
- **HTTP cache headers**: `max-age=300, stale-while-revalidate=3600` (5min strict, 1hr stale)
- **No Supabase tables** for price data — no historical record of any fetched price
- **Rate limiting**: per-IP and per-user (60 items/min each), plus circuit breaker (8 concurrent, 5-failure threshold)
- **BL API quota**: 5,000 calls/day (each `blGetPartPriceGuide` = 1 call; stock+sold fallback = up to 2)

Every price view triggers live API calls. At scale this is unsustainable.

## Strategy

Build an independently-computed price dataset from observations over time. Each BrickLink API fetch — whether triggered by a user view or a batch crawl — is recorded as a timestamped observation. Once enough observations accumulate for an item, we compute our own average: a genuinely derived value that can be served without hitting the API again.

Derived prices are presented as **Brick Party estimated prices** — our own computation, not BrickLink data. Raw BrickLink data is only displayed within the 6-hour ToS window. Observations are retained for a bounded period (180 days) sufficient to compute meaningful averages while respecting the ToS "reasonable periods" caching restriction. This strategy **must be confirmed with BrickLink** (`apisupport@bricklink.com`) before implementation.

## Data Model

Three layers of price data, each with different retention rules:

### 1. BrickLink Cache (`bl_price_cache`)

Raw API response, 6-hour TTL, overwritten on each fetch. This is BrickLink's data served within their ToS window.

```sql
CREATE TABLE public.bl_price_cache (
  item_id TEXT NOT NULL,         -- BL part/minifig/set number
  item_type TEXT NOT NULL,       -- 'PART' | 'MINIFIG' | 'SET'
  color_id INTEGER,              -- BL color ID (null for sets/minifigs)
  condition TEXT NOT NULL,       -- 'new' | 'used'
  currency_code TEXT NOT NULL,   -- e.g. 'USD'
  country_code TEXT,             -- e.g. 'US' or null for global
  avg_price NUMERIC(10,4),
  min_price NUMERIC(10,4),
  max_price NUMERIC(10,4),
  qty_avg_price NUMERIC(10,4),  -- quantity-weighted average
  unit_quantity INTEGER,
  total_quantity INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, item_type, color_id, condition, currency_code, country_code)
);
```

**Retention**: Rows overwritten on each fetch. The `fetched_at` timestamp determines freshness — stale after 6 hours per ToS.

### 2. Observations (`bl_price_observations`)

Log of BL API fetches used to compute derived averages. Each record stores the price snapshot and timestamp.

```sql
CREATE TABLE public.bl_price_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  color_id INTEGER,
  condition TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  country_code TEXT,
  avg_price NUMERIC(10,4),
  min_price NUMERIC(10,4),
  max_price NUMERIC(10,4),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_observations_lookup
  ON bl_price_observations (item_id, item_type, color_id, condition, currency_code, country_code, observed_at);
```

**Retention**: 180 days. Observations older than `OBSERVATION_RETENTION_DAYS` are purged by a scheduled cleanup (daily cron or batch crawl epilogue). This keeps storage bounded and stays within BL ToS "reasonable periods" for caching while retaining enough data for meaningful averages. The 180-day window provides ~26 weekly observations at steady state — more than sufficient for the activation threshold and recency-weighted computation.

### 3. Derived Prices (`bl_derived_prices`)

Our self-computed estimated prices. Stores the mean of observations within the retention window for an item, along with observation metadata. Long TTL (90 days). Presented to users as "Brick Party estimated price" — never labeled as BrickLink data.

```sql
CREATE TABLE public.bl_derived_prices (
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  color_id INTEGER,
  condition TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  country_code TEXT,
  derived_avg NUMERIC(10,4) NOT NULL,
  derived_min NUMERIC(10,4),
  derived_max NUMERIC(10,4),
  observation_count INTEGER NOT NULL,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, item_type, color_id, condition, currency_code, country_code)
);
```

**Retention**: Rows are valid for 90 days from `computed_at`. Expired rows trigger a fresh observation cycle.

## On-Demand Flow

When a user views an item:

1. **Check derived prices** — if a derived average exists and is within its 90-day TTL, return it immediately. Zero API calls.
2. **Check BL cache** — if we have a BrickLink fetch within 6 hours, return it. Zero API calls.
3. **Fetch from BrickLink API** — one call per condition (new + used = 2 calls). Update the BL cache. Append an observation. If the observation threshold is now met, recompute the derived average.
4. **Return whichever price is available.**

If the daily API limit is exhausted and no derived price exists, return no price rather than serving stale BL data.

### Integration with Existing Code

The on-demand flow replaces the current in-memory-only path in `blGetPartPriceGuide()` (`app/lib/bricklink.ts`). The in-memory LRU cache remains as a hot layer above the database:

```
Request → LRU cache (30min) → derived prices (90d) → BL cache (6hr) → BL API → record observation
```

The `fetchBricklinkPrices()` service (`app/lib/services/pricing.ts`) orchestrates batch lookups and already handles identity resolution — it continues to be the entry point. The new database layers slot in below it.

## Activation Threshold

A derived price is only computed and served when:

- At least **3 observations** exist for that item+condition+currency+country
- Those observations span at least **7 days**

This ensures the derived value comes from multiple data points sampled across time, not just repeated fetches on the same day. The thresholds are configurable.

## Batch Crawl

A new `daily-prices` script (or cron job) crawls prices for high-value items proactively. Each fetch in the batch also records an observation as a side effect. After a week of daily runs, items crawled each day will have 7 observations spanning 7 days, meeting the activation threshold.

The batch crawl and on-demand serving are complementary:

- **Batch crawl** seeds coverage proactively (operator-controlled, runs within API budget)
- **On-demand fetches** fill gaps based on actual user demand
- **Both** contribute observations toward derived prices

### Crawl Priority

Items are crawled in priority order to maximize coverage within the daily API budget:

1. Items with observations approaching the activation threshold (2 obs, need 1 more)
2. Popular items (most-viewed sets/parts based on request logs or inventory frequency)
3. Items with expired derived prices (90-day TTL exceeded, need fresh cycle)
4. Cold-start items that have never been priced

## Steady-State Behavior

After several weeks of daily crawls + user traffic:

- **Most popular items** have derived prices — served instantly, zero API calls
- **Less popular items** get priced on-demand when users view them, building toward derived prices
- **New/obscure items** trigger API calls on first view, then build observations over time
- **Derived prices expire** after 90 days, triggering a fresh observation cycle that recomputes the average with newer data

The API budget shifts from "serve every view live" to "refresh expired derived prices + handle cold starts for new items."

## Graceful Degradation

| Situation                           | Behavior                                             |
| ----------------------------------- | ---------------------------------------------------- |
| Derived price exists and fresh      | Serve estimated price, 0 API calls                   |
| No derived, BL cache < 6 hours      | Serve BrickLink price, 0 API calls                   |
| No derived, BL cache expired        | Fetch from API, record observation                   |
| API limit exhausted, derived exists | Serve estimated price                                |
| API limit exhausted, no derived     | No price available (null)                            |
| Item never seen before              | Fetch from API (cold start), begin observation cycle |

Stale BL cache data (> 6 hours) is never displayed to users. Once the cache expires, the only options are a fresh API fetch or a derived estimate. If neither is available, the UI shows no price. This avoids any appearance of serving outdated BrickLink data.

## API Endpoint Changes

### Single-Item / Batch Endpoints (User-Facing)

The existing routes (`/api/prices/bricklink`, `/api/prices/bricklink-set`) use the on-demand flow. Response shape stays the same but gains a new `pricingSource` value:

- `'real_time'` — fresh BL cache or API call (within 6hr window). UI shows "BrickLink price" with BL attribution.
- `'estimated'` — our computed average (served from `bl_derived_prices`). UI shows "Estimated price" with no BL branding. Tooltip: "Based on recent market data."

There is no `'stale'` source. If the BL cache has expired and no derived price exists, the API returns `null` for that item — never stale BL data. The UI shows "Price unavailable" or simply omits the price. This is a strict two-state system: either the data is fresh BrickLink (< 6hr) or it's our own estimate.

### Bulk Listing Endpoints

Bulk endpoints (e.g., all minifig prices for export) serve from the database only — no API calls triggered. These return derived prices where available and fresh BL cache (< 6hr) otherwise. Items with neither return null.

### Introspection Endpoint (Admin/Debug)

A `/api/prices/derived-stats` endpoint provides visibility into derived price coverage: observation counts, computation dates, items approaching threshold, and overall coverage percentage.

## Configuration

| Parameter                    | Default | Purpose                                                             |
| ---------------------------- | ------- | ------------------------------------------------------------------- |
| `DERIVED_MIN_OBSERVATIONS`   | 3       | How many BL fetches before computing a derived price                |
| `DERIVED_MIN_SPAN_DAYS`      | 7       | Observations must cover at least this time range                    |
| `DERIVED_TTL_DAYS`           | 90      | How long a derived price is served before refreshing                |
| `OBSERVATION_RETENTION_DAYS` | 180     | How long observations are kept before purge                         |
| `BL_CACHE_TTL_HOURS`         | 6       | How long raw BL data can be displayed as BrickLink-attributed (ToS) |

## Seeding from Existing Data

There is no existing database-stored price data to seed from (current system is in-memory only). The observation log starts from zero. Estimated ramp-up:

- **Day 1**: All prices are live API calls. Each call seeds one observation.
- **Day 7**: Items hit by users + batch crawl daily have 7 observations, meeting the threshold. Derived prices computed.
- **Day 14**: Popular items fully covered. API budget mostly goes to cold starts and refreshes.
- **Steady state**: The vast majority of price lookups served from derived prices. API budget used for maintaining freshness.

## Migration Plan

### New Supabase Tables

One migration creates all three tables with RLS enabled:

- `bl_price_cache` — service role write, authenticated read
- `bl_price_observations` — service role write only (audit trail)
- `bl_derived_prices` — service role write, authenticated read

### Code Changes

1. **New**: `app/lib/services/priceCache.ts` — database read/write for all three tables, including observation purge logic
2. **New**: `app/lib/services/derivedPricing.ts` — observation recording, threshold checking, average computation (from retention window only)
3. **Modify**: `app/lib/bricklink.ts` — `blGetPartPriceGuide()` checks DB layers before API call, records observation after API call
4. **Modify**: `app/lib/services/pricing.ts` — `fetchBricklinkPrices()` threads derived/cached prices through existing batch logic
5. **Modify**: `app/api/prices/bricklink/route.ts` — response includes updated `pricingSource` values (`real_time` or `estimated`; items with no price return `null`)
6. **Modify**: UI components — conditional labeling based on `pricingSource`: "BrickLink price" (real_time, with attribution), "Estimated price" (estimated, no BL branding), "Price unavailable" (null)
7. **New**: `scripts/daily-prices.ts` — batch crawl script for proactive observation seeding + observation purge epilogue
8. **New**: `app/api/prices/derived-stats/route.ts` — admin introspection endpoint

### Rollout

0. **Get BrickLink approval** — contact `apisupport@bricklink.com` with strategy description. Do not proceed without response.
1. Deploy tables (migration) — no behavior change
2. Deploy observation recording — every API call starts logging, building toward thresholds
3. Deploy UI labeling — `pricingSource`-conditional display ("BrickLink price" vs "Estimated price" vs "Price unavailable")
4. Deploy derived price serving — once items cross threshold, they're served as estimated prices
5. Deploy batch crawl with observation purge — accelerates coverage, keeps observations bounded
6. Monitor API budget — should see declining daily call volume as derived coverage grows

## BrickLink ToS Compliance

The [BrickLink API Terms of Use](https://www.bricklink.com/v3/terms_of_use_api.page) impose three constraints relevant to this system:

1. **Caching restriction**: "You shall not cache or store any Content... other than for reasonable periods in order to provide the service to BrickLink Members."
2. **Display freshness**: "You shall not display item Content or product information... which is more than six hours older than such information is on the Website."
3. **Revenue restriction**: You cannot derive revenue from the API except for non-API parts of the app (Section 4).

### How This Plan Addresses Each

**Caching**: Observations are retained for 180 days (configurable), not indefinitely. This is a bounded, "reasonable period" sufficient to compute averages. The batch crawl epilogue or a daily cron purges observations older than `OBSERVATION_RETENTION_DAYS`. The 180-day window is comparable to Bricqer's documented 60-day price guide cache, which BrickLink tolerates for an active commercial integration partner.

**Display freshness**: The system has exactly two display states — no stale BL data is ever shown. Only fresh BL cache entries (< 6 hours old) display with BrickLink attribution. Derived values are presented as "Estimated price" — our own computation, not BL Content. If neither is available, no price is shown.

| Source            | UI Label            | Attribution                   |
| ----------------- | ------------------- | ----------------------------- |
| BL cache (< 6hr)  | "BrickLink price"   | BL logo/attribution           |
| Derived average   | "Estimated price"   | "Based on recent market data" |
| Neither available | "Price unavailable" | —                             |

**Revenue**: BrickLink pricing (both real-time and estimated) remains free for all users regardless of tier. The Plus subscription gates non-pricing features (tabs, sync, exports). This aligns with Section 4's allowance for charging for "portions or aspects of the Application that do not integrate the API."

### Pre-Implementation Requirement

**This plan must not be built until BrickLink confirms the approach is acceptable.** Contact `apisupport@bricklink.com` with a description of the strategy:

> "We compute rolling averages from price guide observations collected over time and present them as our own estimated prices (not labeled as BrickLink data). Raw BrickLink data is only displayed within the 6-hour window with attribution. Observations are retained for 180 days. Is this approach acceptable under the API Terms of Use?"

A written confirmation removes all ambiguity. A rejection saves us from building something we'd have to tear down. Do not proceed to implementation without a response.

## Key Decisions

- **Simple averaging** — derived price = mean of observation `avg_price` values within the retention window. Could be enhanced later with recency weighting, but simple averaging is sufficient and most defensible.
- **Observations have bounded retention** — 180-day rolling window, purged by scheduled cleanup. Keeps storage bounded and aligns with BL ToS "reasonable periods" for caching. The retention window is long enough for meaningful averages but not indefinite.
- **Derived prices are recomputed, not accumulated** — each computation recalculates from all observations within the retention window. If thresholds or retention change, a recomputation pass can rebuild all derived prices.
- **Derived prices are never BrickLink-branded** — UI presents them as "Estimated price" with generic attribution. Only fresh BL cache data (< 6hr) carries BrickLink branding. This is the key distinction that separates "displaying BL Content" from "displaying our own computation."
- **No per-user API keys required** — the system works with a single shared API key. Per-user keys could be added as an optional power-user feature if demand grows.
- **Detail rows** (individual sale records from BL price guides) are not part of the derived system — they could be captured by batch crawls for supplementary display but aren't needed for the derived average computation.
- **Currency/country scoping** — observations and derived prices are scoped to currency+country, matching the existing user pricing preferences system. A derived price for USD/US is independent from USD/Global.
