import { mapRebrickableFigToBrickLinkOnDemand } from '@/app/lib/minifigMapping';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { rbFetch } from '@/app/lib/rebrickable/client';
import { NextRequest, NextResponse } from 'next/server';

type MinifigMetaResponse = {
  figNum: string;
  blId: string | null;
  imageUrl: string | null;
  name: string;
  numParts: number | null;
};

type RouteParams = {
  params: {
    figNum?: string;
  };
};

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<MinifigMetaResponse | { error: string }>> {
  const raw = params.figNum ?? '';
  const figNum = raw.trim();
  if (!figNum) {
    return NextResponse.json(
      { error: 'missing_fig_num' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Load Rebrickable minifig metadata (name, num_parts) from catalog.
    let rbName = figNum;
    let rbNumParts: number | null = null;
    try {
      const { data, error } = await supabase
        .from('rb_minifigs')
        .select('fig_num,name,num_parts')
        .eq('fig_num', figNum)
        .maybeSingle();
      if (!error && data) {
        if (typeof data.name === 'string' && data.name.trim()) {
          rbName = data.name;
        }
        if (
          typeof data.num_parts === 'number' &&
          Number.isFinite(data.num_parts)
        ) {
          rbNumParts = data.num_parts;
        }
      }
    } catch (err) {
      console.error('[minifig-meta] rb_minifigs lookup failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let blId: string | null = null;
    try {
      blId = await mapRebrickableFigToBrickLinkOnDemand(figNum);
    } catch (err) {
      console.error('[minifig-meta] mapRebrickableFigToBrickLinkOnDemand failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
      blId = null;
    }

    let imageUrl: string | null = null;

    // 1) Check cached image in rb_minifig_images first.
    try {
      const { data: cached, error: cachedError } = await supabase
        .from('rb_minifig_images')
        .select('image_url')
        .eq('fig_num', figNum)
        .maybeSingle();
      if (!cachedError && cached && typeof cached.image_url === 'string') {
        imageUrl = cached.image_url;
      }
    } catch (err) {
      console.error('[minifig-meta] rb_minifig_images lookup failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2) Fallback to Rebrickable minifig image when cache doesn't have one
    //    and cache the result into rb_minifig_images.
    if (!imageUrl) {
      try {
        const d = await rbFetch<{
          set_img_url?: string | null;
          fig_img_url?: string | null;
        }>(`/lego/minifigs/${encodeURIComponent(figNum)}/`);
        let candidate: string | null = null;
        if (typeof d.fig_img_url === 'string' && d.fig_img_url) {
          candidate = d.fig_img_url;
        } else if (typeof d.set_img_url === 'string' && d.set_img_url) {
          candidate = d.set_img_url;
        }
        if (candidate) {
          imageUrl = candidate;
          try {
            await supabase
              .from('rb_minifig_images')
              .upsert(
                {
                  fig_num: figNum,
                  image_url: candidate,
                  last_fetched_at: new Date().toISOString(),
                },
                { onConflict: 'fig_num' }
              );
          } catch (err) {
            console.error(
              '[minifig-meta] failed to cache rb_minifig_images',
              {
                figNum,
                error: err instanceof Error ? err.message : String(err),
              }
            );
          }
        }
      } catch (err) {
        console.error('[minifig-meta] Rebrickable image lookup failed', {
          figNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      figNum,
      blId,
      imageUrl,
      name: rbName,
      numParts: rbNumParts,
    });
  } catch (err) {
    console.error('[minifig-meta] unexpected error', {
      figNum,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'minifig_meta_failed' },
      { status: 500 }
    );
  }
}


