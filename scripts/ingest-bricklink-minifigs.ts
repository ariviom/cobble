import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

import type { Database } from '@/supabase/types';

type MinifigInsert =
  Database['public']['Tables']['bricklink_minifigs']['Insert'];

const DEFAULT_FILE = 'Minifigures.xml';
const BATCH_SIZE = 1000;

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

async function ingestMinifigs(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Minifigure export not found at ${filePath}`);
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
    itemType?: string;
    item_id?: string;
    name?: string;
    category_id?: number | null;
    item_year?: number | null;
  } | null;

  let current: Accumulator = null;
  const batch: MinifigInsert[] = [];
  let processed = 0;

  const flush = async () => {
    if (!batch.length) return;
    const now = new Date().toISOString();
    const payload = batch.map(row => ({
      ...row,
      created_at: row.created_at ?? now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('bricklink_minifigs')
      .upsert(payload, { onConflict: 'item_id' });
    if (error) {
      throw error;
    }
    batch.length = 0;
  };

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === '<ITEM>') {
      current = {};
      continue;
    }

    if (line === '</ITEM>') {
      if (
        current &&
        current.itemType === 'M' &&
        current.item_id &&
        current.name
      ) {
        batch.push({
          item_id: current.item_id,
          name: current.name,
          category_id: current.category_id ?? null,
          item_year: current.item_year ?? null,
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
      case 'ITEMTYPE':
        current.itemType = value;
        break;
      case 'ITEMID':
        current.item_id = value;
        break;
      case 'ITEMNAME':
        current.name = value;
        break;
      case 'CATEGORY': {
        const category = Number(value);
        current.category_id = Number.isFinite(category) ? category : null;
        break;
      }
      case 'ITEMYEAR': {
        const year = Number(value);
        current.item_year = Number.isFinite(year) ? year : null;
        break;
      }
      default:
        break;
    }
  }

  await flush();

  // eslint-disable-next-line no-console
  console.log(
    `[ingest-bricklink-minifigs] Completed upsert for ${processed.toLocaleString()} records.`
  );
}

async function main() {
  const fileFromArg = process.argv[2];
  const filePath = path.resolve(
    process.cwd(),
    fileFromArg && fileFromArg.length > 0 ? fileFromArg : DEFAULT_FILE
  );
  await ingestMinifigs(filePath);
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
