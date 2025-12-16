import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';

// Development-only route for reviewing low-confidence minifig mappings

type SetMappingReview = {
  set_num: string;
  set_name: string;
  total_minifigs: number;
  low_confidence_count: number;
  avg_confidence: number;
  min_confidence: number;
  mappings: Array<{
    rb_fig_id: string;
    rb_name: string | null;
    rb_img_url: string | null;
    bl_minifig_no: string;
    bl_name: string | null;
    bl_img_url: string | null;
    confidence: number | null;
    source: string | null;
    quantity: number;
  }>;
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const confidenceThreshold = Number(
    searchParams.get('confidence_threshold') ?? 0.5
  );
  const limit = Number(searchParams.get('limit') ?? 50);
  const offset = Number(searchParams.get('offset') ?? 0);
  const sortBy = searchParams.get('sort') ?? 'min_confidence'; // min_confidence, avg_confidence, count
  const hideApproved = searchParams.get('hide_approved') === 'true';
  const setNumFilter = searchParams.get('set_num') ?? null; // Filter by specific set

  // Use service role client to access catalog tables with RLS
  const supabase = getSupabaseServiceRoleClient();

  try {
    // Get sets with low-confidence mappings
    const { data: setsWithLowConfidence, error: setsErr } = await supabase.rpc(
      'get_sets_with_low_confidence_minifig_mappings' as never,
      {
        confidence_threshold: confidenceThreshold,
        result_limit: limit,
        result_offset: offset,
        sort_by: sortBy,
      } as never
    );

    if (setsErr) {
      // Fallback: manual query
      // First, get all mappings below or equal to threshold
      let mappingsQuery = supabase
        .from('bricklink_minifig_mappings')
        .select(
          'rb_fig_id, bl_item_id, confidence, source, manual_review, manually_approved'
        )
        .lte('confidence', confidenceThreshold); // Changed from .lt to .lte to include threshold value

      // Filter out approved if requested
      if (hideApproved) {
        mappingsQuery = mappingsQuery.or(
          'manual_review.is.null,manual_review.eq.false,manually_approved.is.null,manually_approved.eq.false'
        );
      }

      const { data: lowConfMappings, error: mappingsErr } =
        await mappingsQuery.order('confidence', { ascending: true });

      if (mappingsErr) throw mappingsErr;

      if (!lowConfMappings || lowConfMappings.length === 0) {
        return NextResponse.json({
          sets: [],
          total: 0,
          params: {
            confidence_threshold: confidenceThreshold,
            limit,
            offset,
            sort_by: sortBy,
          },
        });
      }

      // Create a map of low-confidence mappings for quick lookup
      const confidenceMap = new Map(
        lowConfMappings.map(m => [
          `${m.rb_fig_id}:${m.bl_item_id}`,
          {
            confidence: m.confidence,
            source: m.source,
            manually_approved: m.manually_approved ?? false,
          },
        ])
      );

      let filteredSets: Array<{
        set_num: string;
        rb_fig_id: string | null;
        minifig_no: string;
        quantity: number | null;
        name: string | null;
        image_url: string | null;
      }> = [];
      let rbFigIds: string[] = [];

      if (setNumFilter) {
        // When filtering by specific set, get ALL minifigs in that set (including unmapped)
        const { data: allSetMinifigs, error: setErr } = await supabase
          .from('bl_set_minifigs')
          .select('set_num, rb_fig_id, minifig_no, quantity, name, image_url')
          .eq('set_num', setNumFilter);
        // NOTE: No .not('rb_fig_id', 'is', null) - we want ALL minifigs including unmapped

        if (setErr) throw setErr;

        // Get RB figs that are mapped
        const setRbFigIds = Array.from(
          new Set(
            (allSetMinifigs ?? [])
              .map(m => m.rb_fig_id)
              .filter(Boolean) as string[]
          )
        );

        // Get ALL mappings for these RB figs (ignore threshold and hideApproved when viewing specific set)
        const { data: allSetMappings } = await supabase
          .from('bricklink_minifig_mappings')
          .select(
            'rb_fig_id, bl_item_id, confidence, source, manual_review, manually_approved'
          )
          .in('rb_fig_id', setRbFigIds);
        // NOTE: No .lte('confidence', confidenceThreshold) - show ALL mappings in set

        // Rebuild confidence map with ALL mappings for this set
        const setConfidenceMap = new Map(
          (allSetMappings ?? []).map(m => [
            `${m.rb_fig_id}:${m.bl_item_id}`,
            {
              confidence: m.confidence,
              source: m.source,
              manually_approved: m.manually_approved ?? false,
            },
          ])
        );

        // Include ALL minifigs from the set
        filteredSets = (allSetMinifigs ?? []).map(s => ({
          ...s,
          // For unmapped minifigs, rb_fig_id will be null
        }));

        rbFigIds = setRbFigIds;

        // Update global confidence map for later use
        for (const [key, value] of setConfidenceMap) {
          confidenceMap.set(key, value);
        }
      } else {
        // When not filtering by set, use the original logic
        rbFigIds = Array.from(new Set(lowConfMappings.map(m => m.rb_fig_id)));

        const { data: sets, error: fallbackErr } = await supabase
          .from('bl_set_minifigs')
          .select('set_num, rb_fig_id, minifig_no, quantity, name, image_url')
          .in('rb_fig_id', rbFigIds)
          .not('rb_fig_id', 'is', null);

        if (fallbackErr) throw fallbackErr;

        // Filter to only sets where the (rb_fig_id, minifig_no) pair is in our low-confidence map
        filteredSets = (sets ?? []).filter(s => {
          const key = `${s.rb_fig_id}:${s.minifig_no}`;
          return confidenceMap.has(key);
        });
      }

      // Group by set
      const setMap = new Map<string, typeof filteredSets>();
      for (const row of filteredSets) {
        const key = row.set_num;
        if (!setMap.has(key)) {
          setMap.set(key, []);
        }
        setMap.get(key)!.push(row);
      }

      // Get RB minifig details in batches (avoid query limits)
      const BATCH_SIZE = 500;
      const allRbMinifigs: Array<{ fig_num: string; name: string }> = [];

      for (let i = 0; i < rbFigIds.length; i += BATCH_SIZE) {
        const batch = rbFigIds.slice(i, i + BATCH_SIZE);
        const { data: rbMinifigs } = await supabase
          .from('rb_minifigs')
          .select('fig_num, name')
          .in('fig_num', batch);

        if (rbMinifigs) {
          allRbMinifigs.push(...rbMinifigs);
        }
      }

      // Get RB minifig images (only some have images in the table)
      const { data: rbImages } = await supabase
        .from('rb_minifig_images')
        .select('fig_num, image_url')
        .in('fig_num', rbFigIds);

      const rbImageMap = new Map(
        rbImages?.map(img => [img.fig_num, img.image_url]) ?? []
      );

      const rbMinifigMap = new Map(
        allRbMinifigs.map(m => [
          m.fig_num,
          {
            ...m,
            // Use stored image if available, otherwise construct URL
            img_url:
              rbImageMap.get(m.fig_num) ??
              `https://cdn.rebrickable.com/media/sets/${m.fig_num}.jpg`,
          },
        ])
      );

      // Build response
      const results: SetMappingReview[] = [];

      for (const [setNum, setMinifigs] of Array.from(setMap.entries()).slice(
        offset,
        offset + limit
      )) {
        const mappingsWithConfidence = setMinifigs
          .map(m => {
            // Handle unmapped minifigs (rb_fig_id is null)
            if (!m.rb_fig_id) {
              return {
                rb_fig_id: '' as string, // Will be shown as unmapped
                rb_name: null,
                rb_img_url: null,
                bl_minifig_no: m.minifig_no,
                bl_name: m.name,
                bl_img_url: `https://img.bricklink.com/ItemImage/MN/0/${m.minifig_no}.png`,
                confidence: null,
                source: 'unmapped',
                quantity: m.quantity ?? 1,
              };
            }

            const key = `${m.rb_fig_id}:${m.minifig_no}`;
            const mapping = confidenceMap.get(key);
            const rbMinifig = rbMinifigMap.get(m.rb_fig_id);

            return {
              rb_fig_id: m.rb_fig_id,
              rb_name: rbMinifig?.name ?? null,
              rb_img_url: rbMinifig?.img_url ?? null,
              bl_minifig_no: m.minifig_no,
              bl_name: m.name,
              // Construct BL image URL (BrickLink CDN format)
              bl_img_url: `https://img.bricklink.com/ItemImage/MN/0/${m.minifig_no}.png`,
              confidence: mapping?.confidence ?? null,
              source: mapping?.manually_approved
                ? 'manual-approval'
                : (mapping?.source ?? null),
              quantity: m.quantity ?? 1,
            };
          })
          // When filtering by specific set, show ALL minifigs (ignore confidence threshold)
          .filter(
            m =>
              setNumFilter ||
              (m.confidence !== null && m.confidence <= confidenceThreshold)
          );

        if (mappingsWithConfidence.length === 0) continue;

        const confidences = mappingsWithConfidence
          .map(m => m.confidence)
          .filter((c): c is number => c !== null);

        // Get set name
        const { data: setData } = await supabase
          .from('rb_sets')
          .select('name')
          .eq('set_num', setNum)
          .single();

        results.push({
          set_num: setNum,
          set_name: setData?.name ?? setNum,
          total_minifigs: setMinifigs.length,
          low_confidence_count: mappingsWithConfidence.length,
          avg_confidence:
            confidences.reduce((a, b) => a + b, 0) / confidences.length,
          min_confidence: Math.min(...confidences),
          mappings: mappingsWithConfidence.sort(
            (a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)
          ),
        });
      }

      // Sort results
      results.sort((a, b) => {
        if (sortBy === 'min_confidence')
          return a.min_confidence - b.min_confidence;
        if (sortBy === 'avg_confidence')
          return a.avg_confidence - b.avg_confidence;
        if (sortBy === 'count')
          return b.low_confidence_count - a.low_confidence_count;
        return 0;
      });

      // Get total minifig count from database
      const { count: totalMinifigsCount } = await supabase
        .from('bricklink_minifig_mappings')
        .select('*', { count: 'exact', head: true });

      // Get count for current threshold
      const { count: thresholdMinifigsCount } = await supabase
        .from('bricklink_minifig_mappings')
        .select('*', { count: 'exact', head: true })
        .lte('confidence', confidenceThreshold);

      // Count minifigs in current filter
      const totalMinigifsInFilter = results.reduce(
        (sum, set) => sum + set.mappings.length,
        0
      );

      return NextResponse.json({
        sets: results,
        total: setMap.size,
        total_minifigs: totalMinifigsCount ?? 0,
        total_minifigs_at_threshold: thresholdMinifigsCount ?? 0,
        total_minifigs_in_filter: totalMinigifsInFilter,
        params: {
          confidence_threshold: confidenceThreshold,
          limit,
          offset,
          sort_by: sortBy,
        },
      });
    }

    // Get total minifig count from database
    const { count: totalMinifigsCount } = await supabase
      .from('bricklink_minifig_mappings')
      .select('*', { count: 'exact', head: true });

    // Get count for current threshold
    const { count: thresholdMinifigsCount } = await supabase
      .from('bricklink_minifig_mappings')
      .select('*', { count: 'exact', head: true })
      .lte('confidence', confidenceThreshold);

    const sets = (setsWithLowConfidence ?? []) as SetMappingReview[];
    return NextResponse.json({
      sets,
      total: sets.length,
      total_minifigs: totalMinifigsCount ?? 0,
      total_minifigs_at_threshold: thresholdMinifigsCount ?? 0,
      total_minifigs_in_filter: 0, // RPC doesn't provide this easily
      params: {
        confidence_threshold: confidenceThreshold,
        limit,
        offset,
        sort_by: sortBy,
      },
    });
  } catch (error) {
    console.error('Failed to fetch minifig mapping review data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch review data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
