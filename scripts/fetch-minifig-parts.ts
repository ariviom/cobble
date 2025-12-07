import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import { extractBricklinkPartId } from '@/app/lib/rebrickable/utils';
import type { Database } from '@/supabase/types';

type RebrickableMinifigPart = {
  part: {
    part_num: string;
    name?: string;
    part_img_url?: string | null;
    external_ids?: Record<string, unknown> | null;
  };
  color?: {
    id: number;
    name: string;
  };
  quantity: number;
};

function log(message: string, extra?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log(`[fetch-minifig-parts] ${message}`, extra ?? '');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function getRebrickableApiKey(): string {
  return requireEnv('REBRICKABLE_API');
}

async function rbFetchScript<T>(
  path: string,
  searchParams?: Record<string, string | number>
): Promise<T> {
  const apiKey = getRebrickableApiKey();
  const url = new URL(`https://rebrickable.com/api/v3${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `key ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = text ? text.slice(0, 200) : 'error';
    const err = new Error(`Rebrickable ${res.status}: ${message}`);
    (err as any).status = res.status;
    (err as any).body = message;
    throw err;
  }
  return (await res.json()) as T;
}

async function rbFetchAbsoluteScript<T>(absoluteUrl: string): Promise<T> {
  const apiKey = getRebrickableApiKey();
  const res = await fetch(absoluteUrl, {
    headers: { Authorization: `key ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = text ? text.slice(0, 200) : 'error';
    const err = new Error(`Rebrickable ${res.status}: ${message}`);
    (err as any).status = res.status;
    (err as any).body = message;
    throw err;
  }
  return (await res.json()) as T;
}

async function fetchSubparts(figNum: string): Promise<
  Array<{
    partId: string;
    colorId: number;
    quantity: number;
    bricklinkPartId: string | null;
  }>
> {
  const parts: RebrickableMinifigPart[] = [];
  let nextUrl: string | null = null;
  let firstPage = true;
  while (firstPage || nextUrl) {
    let response:
      | {
          results: RebrickableMinifigPart[];
          next: string | null;
        }
      | undefined;
    try {
      if (firstPage) {
        response = await rbFetchScript<{
          results: RebrickableMinifigPart[];
          next: string | null;
        }>(`/lego/minifigs/${encodeURIComponent(figNum)}/parts/`, {
          page_size: 1000,
          inc_part_details: 1,
        });
      } else if (nextUrl) {
        response = await rbFetchAbsoluteScript<{
          results: RebrickableMinifigPart[];
          next: string | null;
        }>(nextUrl);
      }
    } catch (err) {
      const status = (err as any)?.status as number | undefined;
      const body = (err as any)?.body as string | undefined;
      const match = body?.match(/Expected available in\s+(\d+)\s+seconds?/i);
      if (status === 429) {
        const delaySeconds = match && Number(match[1]) > 0 ? Number(match[1]) : 30;
        const delayMs = delaySeconds * 1000;
        log('Throttled; backing off', { figNum, delayMs });
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }

    if (!response) break;
    parts.push(...response.results);
    nextUrl = response.next;
    firstPage = false;
  }

  return parts.map(item => {
    const partId = item.part.part_num;
    const bricklinkPartId = extractBricklinkPartId(item.part.external_ids);
    return {
      partId,
      colorId: item.color?.id ?? 0,
      quantity: Math.max(1, Math.floor(item.quantity ?? 1)),
      bricklinkPartId:
        bricklinkPartId && bricklinkPartId !== partId ? bricklinkPartId : null,
    };
  });
}

async function main() {
  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  const budget =
    Number.parseInt(process.env.MINIFIG_PARTS_BUDGET ?? '', 10) || 100;
  const pageSize =
    Number.parseInt(process.env.MINIFIG_PARTS_PAGE_SIZE ?? '', 10) || 200;
  const userFirst =
    (process.env.MINIFIG_PARTS_USER_FIRST ?? '').toLowerCase() === 'true';

  let processed = 0;
  let offset = 0;

  const loadUserFigIds = async (): Promise<string[]> => {
    const { data, error } = await supabase
      .from('user_minifigs')
      .select('fig_num');
    if (error) {
      log('Failed to load user_minifigs', { error: error.message });
      return [];
    }
    const ids = Array.from(
      new Set((data ?? []).map(row => row.fig_num).filter(Boolean))
    );
    return ids;
  };

  const shouldSkipFig = async (figNum: string): Promise<boolean> => {
    const { count, error } = await supabase
      .from('rb_minifig_parts')
      .select('*', { count: 'exact', head: true })
      .eq('fig_num', figNum);
    if (error) {
      log('Failed to count rb_minifig_parts', { figNum, error: error.message });
      return true;
    }
    return typeof count === 'number' && count > 0;
  };

  const processFig = async (figNum: string): Promise<boolean> => {
    if (processed >= budget) return false;
    if (!figNum) return false;

    const skip = await shouldSkipFig(figNum);
    if (skip) return false;

    log('Fetching subparts', { figNum });
    const subparts = await fetchSubparts(figNum);
    if (subparts.length === 0) {
      log('No subparts returned', { figNum });
      return false;
    }

    const rows = subparts.map(sp => ({
      fig_num: figNum,
      part_num: sp.partId,
      color_id: sp.colorId,
      quantity: sp.quantity,
    }));

    const { error: upsertErr } = await supabase
      .from('rb_minifig_parts')
      .upsert(rows);
    if (upsertErr) {
      log('Failed to upsert rb_minifig_parts', {
        figNum,
        error: upsertErr.message,
      });
      return false;
    }

    const mappingRows = subparts
      .filter(sp => sp.bricklinkPartId && sp.bricklinkPartId !== sp.partId)
      // Deduplicate by rb_part_id to avoid ON CONFLICT issues within a single statement.
      .reduce<Record<string, { rb_part_id: string; bl_part_id: string; source: string }>>(
        (acc, sp) => {
          const rbId = sp.partId;
          if (!rbId) return acc;
          if (acc[rbId]) return acc;
          acc[rbId] = {
            rb_part_id: rbId,
            bl_part_id: sp.bricklinkPartId!,
            source: 'minifig-component',
          };
          return acc;
        },
        {}
      );

      const dedupedMappings = Object.values(mappingRows);
      if (dedupedMappings.length > 0) {
      const { error: mapErr } = await supabase
        .from('part_id_mappings')
          .upsert(dedupedMappings, { onConflict: 'rb_part_id' });
      if (mapErr) {
        log('Failed to upsert part_id_mappings', {
          figNum,
          error: mapErr.message,
        });
      }
    }

    processed += 1;
    if (processed % 10 === 0) {
      log('Progress', { processed, budget });
    }
    return true;
  };

  // Optional: process user minifigs first.
  if (userFirst && processed < budget) {
    const userIds = await loadUserFigIds();
    for (const figNum of userIds) {
      if (processed >= budget) break;
      await processFig(figNum);
    }
  }

  while (processed < budget) {
    const { data: figs, error } = await supabase
      .from('rb_minifigs')
      .select('fig_num')
      .order('fig_num', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load rb_minifigs: ${error.message}`);
    }

    if (!figs || figs.length === 0) {
      break;
    }

    for (const row of figs) {
      if (processed >= budget) break;
      const figNum = row.fig_num;
      if (!figNum) continue;
      await processFig(figNum);
    }

    offset += pageSize;
  }

  log('Done', { processed, budget });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

