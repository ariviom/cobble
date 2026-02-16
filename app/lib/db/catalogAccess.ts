/**
 * Centralized Supabase client selection for catalog and data access.
 *
 * This module provides a single source of truth for which Supabase client
 * should be used for each table, based on RLS policies and access patterns.
 *
 * Design principles:
 * 1. Tables with anon SELECT policies → use anon client (getSupabaseServerClient)
 * 2. Internal catalog tables (RLS enabled, no anon policies) → use service role
 * 3. User-owned tables → use auth server client (SSR with cookies)
 *
 * Benefits:
 * - Single place to document and enforce access patterns
 * - Compile-time type safety via TypeScript
 * - Runtime validation to catch mistakes early
 * - Clear documentation of RLS policy requirements
 */
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';

// =============================================================================
// TABLE CLASSIFICATIONS
// =============================================================================

/**
 * Tables that have anon/authenticated SELECT policies.
 * These can be read by any client (including unauthenticated users).
 */
const ANON_READABLE_TABLES = new Set([
  // Rebrickable catalog tables (public catalog data)
  'rb_sets',
  'rb_parts',
  'rb_colors',
  'rb_themes',
  'rb_part_categories',
  'rb_set_parts',
  'rb_download_versions',
]);

/**
 * Tables that require service role access (RLS enabled, no anon/auth policies).
 * These are internal catalog tables used by scripts and server-side operations.
 */
const SERVICE_ROLE_TABLES = new Set([
  // Rebrickable internal tables (minifig inventory data)
  'rb_inventories',
  'rb_inventory_parts',
  'rb_inventory_minifigs',
  'rb_minifigs',
  'rb_minifig_parts',
  'rb_minifig_images',

  // BrickLink mapping and cache tables
  'bl_set_minifigs',
  'bl_minifig_parts',
  'bl_parts',
  'bl_part_sets',
]);

/**
 * Tables that require user authentication and use RLS for row-level access.
 * These should use the auth server client (SSR) or browser client.
 */
const USER_TABLES = new Set([
  'user_profiles',
  'user_preferences',
  'user_sets',
  'user_minifigs',
  'user_set_parts',

  'user_lists',
  'user_list_items',
  'group_sessions',
  'group_session_participants',
  'user_recent_sets',
]);

// =============================================================================
// CLIENT SELECTION
// =============================================================================

export type TableAccessLevel = 'anon' | 'service_role' | 'user';

/**
 * Determine the access level required for a table.
 * Throws if the table is unknown (indicates missing classification).
 */
export function getTableAccessLevel(table: string): TableAccessLevel {
  if (ANON_READABLE_TABLES.has(table)) {
    return 'anon';
  }
  if (SERVICE_ROLE_TABLES.has(table)) {
    return 'service_role';
  }
  if (USER_TABLES.has(table)) {
    return 'user';
  }
  throw new Error(
    `Unknown table: "${table}". Add to ANON_READABLE_TABLES, SERVICE_ROLE_TABLES, or USER_TABLES in catalogAccess.ts`
  );
}

/**
 * Get the appropriate Supabase client for a table based on its access level.
 *
 * Note: For user tables, this returns the service role client which bypasses RLS.
 * For proper user-scoped access, use getSupabaseAuthServerClient() directly.
 */
export function getClientForTable(table: string): SupabaseClient<Database> {
  const level = getTableAccessLevel(table);

  switch (level) {
    case 'anon':
      return getSupabaseServerClient();
    case 'service_role':
      return getSupabaseServiceRoleClient();
    case 'user':
      // For user tables accessed server-side without auth context,
      // fall back to service role. Callers who need RLS should use
      // getSupabaseAuthServerClient() directly.
      return getSupabaseServiceRoleClient();
    default:
      throw new Error(`Unhandled access level: ${level}`);
  }
}

/**
 * Get the anon client for public catalog reads.
 * Use this for tables in ANON_READABLE_TABLES.
 */
export function getCatalogReadClient(): SupabaseClient<Database> {
  return getSupabaseServerClient();
}

/**
 * Get the service role client for internal catalog operations.
 * Use this for tables in SERVICE_ROLE_TABLES.
 */
export function getCatalogWriteClient(): SupabaseClient<Database> {
  return getSupabaseServiceRoleClient();
}

// =============================================================================
// HELPERS FOR COMMON PATTERNS
// =============================================================================

/**
 * Check if a table is publicly readable (anon SELECT policy).
 */
export function isPubliclyReadable(table: string): boolean {
  return ANON_READABLE_TABLES.has(table);
}

/**
 * Check if a table requires service role access.
 */
export function requiresServiceRole(table: string): boolean {
  return SERVICE_ROLE_TABLES.has(table);
}

/**
 * Check if a table is user-scoped (has RLS policies for user_id).
 */
export function isUserScoped(table: string): boolean {
  return USER_TABLES.has(table);
}

/**
 * Get all tables that require service role access.
 * Useful for auditing and documentation.
 */
export function getServiceRoleTables(): string[] {
  return Array.from(SERVICE_ROLE_TABLES);
}

/**
 * Get all tables that are publicly readable.
 * Useful for auditing and documentation.
 */
export function getPubliclyReadableTables(): string[] {
  return Array.from(ANON_READABLE_TABLES);
}

/**
 * Get all user-scoped tables.
 * Useful for auditing and documentation.
 */
export function getUserScopedTables(): string[] {
  return Array.from(USER_TABLES);
}
