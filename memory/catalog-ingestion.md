# Rebrickable Catalog Ingestion & Cron Plan

## Current Ingestion Script

- Script: `scripts/ingest-rebrickable.ts`
- Behavior:
  - Downloads Rebrickable bulk CSVs from `https://cdn.rebrickable.com/media/downloads`:
    - `themes.csv.gz`, `colors.csv.gz`, `part_categories.csv.gz`, `parts.csv.gz`, `sets.csv.gz`
    - `minifigs.csv.gz`, `inventories.csv.gz`, `inventory_parts.csv.gz`, `inventory_minifigs.csv.gz`
  - Streams and parses CSVs, batching `upsert` into:
    - `rb_themes`, `rb_colors`, `rb_part_categories`, `rb_parts`, `rb_sets`
    - `rb_minifigs`, `rb_inventories`, `rb_inventory_parts`, `rb_inventory_minifigs`
  - Tracks which URLs/versions have been ingested via `rb_download_versions` and skips unchanged sources.
  - Requires env:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`

Manual run:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="...service-role..." \
npm run ingest:rebrickable
```

## Planned Cron via GitHub Actions

We will schedule the ingestion script using GitHub Actions (no extra infra, no filesystem assumptions beyond Node):

- Workflow file: `.github/workflows/ingest-rebrickable.yml`
- Trigger:
  - `on: schedule` (e.g. `0 3 * * *` for daily)
  - `on: workflow_dispatch` for manual runs
- Job outline:

```yaml
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Run Rebrickable ingest
        env:
          SUPABASE_URL: https://nrrunazjjrwxaonlvvhh.supabase.co
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run ingest:rebrickable
```

- Secrets in GitHub:
  - `SUPABASE_SERVICE_ROLE_KEY` (service-role key from Supabase)
  - Optionally `SUPABASE_URL` as a secret instead of hard-coding

## Future Option: Supabase Cron + Edge Function

Potential later phase (not implemented yet):

- Port ingestion logic to a Supabase Edge Function `ingest-rebrickable` (Deno + `@supabase/supabase-js`).
- Use Supabase Cron (`cron.schedule` + `pg_net`) to call the Edge Function on a schedule, with:
  - Project URL + auth token stored in Supabase Vault
  - `net.http_post` to `https://<project-ref>.supabase.co/functions/v1/ingest-rebrickable`

For now, GitHub Actions remains the primary plan; Edge Function + Supabase Cron is an optional later optimization if we want everything contained inside Supabase.



