/**
 * Centralized Supabase client selection for catalog and data access.
 *
 * This module provides a single source of truth for which Supabase client
 * should be used for each table, based on RLS policies and access patterns.
 *
 * Design principles:
 * 1. Tables with anon SELECT policies → use anon client (getSupabaseServerClient)
 *    rb_sets, rb_parts, rb_colors, rb_themes, rb_part_categories, rb_set_parts,
 *    rb_download_versions, rb_part_rarity, rb_minifig_rarity, rb_inventories,
 *    rb_inventory_parts, rb_inventory_minifigs, rb_minifigs, rb_minifig_parts
 *
 * 2. Internal catalog tables (RLS enabled, no anon policies) → use service role
 *    rb_minifig_images, bl_minifig_parts, bl_parts, bl_part_sets, bl_set_minifigs,
 *    bl_price_cache, bl_price_observations, bp_derived_prices
 *
 * 3. User-owned tables → use auth server client (SSR with cookies)
 *    user_profiles, user_preferences, user_sets, user_minifigs, user_set_parts,
 *    user_lists, user_list_items, group_sessions, group_session_participants,
 *    user_recent_sets
 */
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';

/**
 * Get the anon client for public catalog reads.
 */
export function getCatalogReadClient(): SupabaseClient<Database> {
  return getSupabaseServerClient();
}

/**
 * Get the service role client for internal catalog operations.
 */
export function getCatalogWriteClient(): SupabaseClient<Database> {
  return getSupabaseServiceRoleClient();
}
