import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

import type { Database } from '@/supabase/types';

// Load environment variables with Next.js-style precedence:
// - Production: ".env" only
// - Non-production: ".env" then ".env.local" (local overrides base)
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

type CategoryInsert =
  Database['public']['Tables']['bricklink_categories']['Insert'];

const DEFAULT_FILE = 'Categories.xml';
const BATCH_SIZE = 500;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function ingestCategories(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Categories export not found at ${filePath}`);
  }

  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  type Accumulator = {
    category_id?: number;
    category_name?: string;
    parent_id?: number | null;
  } | null;

  let current: Accumulator = null;
  const batch: CategoryInsert[] = [];
  let processed = 0;

  const flush = async () => {
    if (!batch.length) return;
    const now = new Date().toISOString();
    const payload = batch.map(row => ({
      ...row,
      created_at: row.created_at ?? now,
      updated_at: now,
    }));

    // First pass: insert categories without parent_id to avoid FK violations
    // Then update with parent_id
    const withoutParent = payload.map(({ parent_id: _, ...rest }) => rest);

    const { error: insertError } = await supabase
      .from('bricklink_categories')
      .upsert(withoutParent, { onConflict: 'category_id' });

    if (insertError) {
      throw insertError;
    }

    // Second pass: update parent_id for categories that have one
    const withParent = payload.filter(
      (row): row is typeof row & { parent_id: number } =>
        typeof row.parent_id === 'number'
    );

    for (const row of withParent) {
      const { error: updateError } = await supabase
        .from('bricklink_categories')
        .update({ parent_id: row.parent_id })
        .eq('category_id', row.category_id);

      if (updateError) {
        // Parent might not exist yet, log but continue
        console.warn(
          `Failed to set parent_id for category ${row.category_id}: ${updateError.message}`
        );
      }
    }

    batch.length = 0;
  };

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === '<CATEGORY>') {
      current = {};
      continue;
    }

    if (line === '</CATEGORY>') {
      if (current && current.category_id && current.category_name) {
        batch.push({
          category_id: current.category_id,
          category_name: current.category_name,
          parent_id: current.parent_id ?? null,
        });
        processed += 1;
        if (batch.length >= BATCH_SIZE) {
          await flush();
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const match = line.match(/^<([A-Z]+)>(.*)<\/\1>$/);
    if (!match) continue;
    const [, tag, valueRaw] = match;
    const value = decodeXml(valueRaw.trim());

    switch (tag) {
      case 'CATEGORY': {
        const id = Number(value);
        if (Number.isFinite(id)) {
          current.category_id = id;
        }
        break;
      }
      case 'CATEGORYNAME':
        current.category_name = value;
        break;
      case 'PARENTID': {
        const parent = Number(value);
        // BrickLink uses 0 or empty for no parent
        current.parent_id =
          Number.isFinite(parent) && parent > 0 ? parent : null;
        break;
      }
      default:
        break;
    }
  }

  await flush();

  // eslint-disable-next-line no-console
  console.log(
    `[ingest-bricklink-categories] Completed upsert for ${processed.toLocaleString()} categories.`
  );
}

async function main() {
  const fileFromArg = process.argv[2];
  const filePath = path.resolve(
    process.cwd(),
    fileFromArg && fileFromArg.length > 0 ? fileFromArg : DEFAULT_FILE
  );
  await ingestCategories(filePath);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
