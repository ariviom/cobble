import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';

import type { Database } from '@/supabase/types';

// Load environment variables with Next.js-style precedence
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BL_STORE_BASE = 'https://api.bricklink.com/api/store/v1';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function rfc3986encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildOAuthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string | number>
): string {
  const consumerKey = requireEnv('BRICKLINK_CONSUMER_KEY');
  const consumerSecret = requireEnv('BRICKLINK_CONSUMER_SECRET');
  const token = requireEnv('BRICKLINK_TOKEN_VALUE');
  const tokenSecret =
    process.env.BRICKLINK_TOKEN_SECRET ?? process.env.BRICLINK_TOKEN_SECRET;
  if (!tokenSecret) {
    throw new Error('Missing BRICKLINK_TOKEN_SECRET');
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const sigParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(oauthParams)) sigParams[k] = String(v);
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v === undefined || v === null) continue;
    sigParams[k] = String(v);
  }

  const norm = Object.keys(sigParams)
    .sort()
    .map(k => `${rfc3986encode(k)}=${rfc3986encode(sigParams[k])}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    rfc3986encode(url),
    rfc3986encode(norm),
  ].join('&');
  const signingKey = `${rfc3986encode(consumerSecret)}&${rfc3986encode(tokenSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  const header =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map(k => `${rfc3986encode(k)}="${rfc3986encode(headerParams[k]!)}"`)
      .join(', ');
  return header;
}

type BLCategory = {
  category_id: number;
  category_name: string;
  parent_id: number;
};

type BLResponse<T> = {
  meta?: { code?: number; message?: string };
  data: T;
};

async function fetchCategories(): Promise<BLCategory[]> {
  const url = new URL(`${BL_STORE_BASE}/categories`);
  const authHeader = buildOAuthHeader('GET', url.origin + url.pathname, {});

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BrickLink ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as BLResponse<BLCategory[]>;
  if (json?.meta && json.meta.code && json.meta.code !== 200) {
    throw new Error(
      `BrickLink meta ${json.meta.code}: ${json.meta.message ?? 'error'}`
    );
  }

  return json.data ?? [];
}

async function main() {
  console.log(
    '[fetch-bricklink-categories] Fetching categories from BrickLink API...'
  );

  const categories = await fetchCategories();
  console.log(
    `[fetch-bricklink-categories] Received ${categories.length} categories`
  );

  if (categories.length === 0) {
    console.log('[fetch-bricklink-categories] No categories to insert');
    return;
  }

  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  // Insert categories in batches, handling parent_id FK constraints
  const BATCH_SIZE = 500;
  const now = new Date().toISOString();

  // First pass: insert all categories without parent_id to avoid FK violations
  console.log(
    '[fetch-bricklink-categories] First pass: inserting categories without parent_id...'
  );

  for (let i = 0; i < categories.length; i += BATCH_SIZE) {
    const batch = categories.slice(i, i + BATCH_SIZE).map(cat => ({
      category_id: cat.category_id,
      category_name: cat.category_name,
      created_at: now,
      updated_at: now,
    }));

    const { error } = await supabase
      .from('bricklink_categories')
      .upsert(batch, { onConflict: 'category_id' });

    if (error) {
      throw error;
    }

    console.log(
      `[fetch-bricklink-categories] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(categories.length / BATCH_SIZE)}`
    );
  }

  // Second pass: update parent_id for categories that have one
  console.log(
    '[fetch-bricklink-categories] Second pass: updating parent_id...'
  );

  const withParent = categories.filter(cat => cat.parent_id > 0);
  let updated = 0;
  let failed = 0;

  for (const cat of withParent) {
    const { error } = await supabase
      .from('bricklink_categories')
      .update({ parent_id: cat.parent_id, updated_at: now })
      .eq('category_id', cat.category_id);

    if (error) {
      console.warn(
        `Failed to set parent_id for ${cat.category_id}: ${error.message}`
      );
      failed += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    `[fetch-bricklink-categories] Updated ${updated} categories with parent_id (${failed} failed)`
  );
  console.log(
    `[fetch-bricklink-categories] Done! Total categories: ${categories.length}`
  );
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
