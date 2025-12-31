-- Migration: Fix Supabase Database Linter Issues
--
-- This migration addresses the following linter findings:
-- 
-- ERRORS:
-- 1. Six views with SECURITY DEFINER (security_definer_view) - Fixed by adding SECURITY INVOKER
-- 
-- WARNINGS:
-- 2. Function get_sets_with_minifigs has mutable search_path - Fixed by adding SET search_path
-- 3. Extension pg_trgm in public schema - Fixed by moving to extensions schema
-- 
-- INFO/SUGGESTIONS:
-- 4. Internal catalog tables have RLS enabled but no policies - Fixed with explicit service_role policies
-- 5. Leaked password protection disabled - NOTE: Must be enabled in Supabase dashboard
--
-- Manual Action Required:
-- ⚠️  Enable leaked password protection in Supabase Dashboard:
--     Settings → Authentication → Password Protection → Enable HaveIBeenPwned check


-- =============================================================================
-- FIX 1: Recreate views with SECURITY INVOKER
-- =============================================================================
-- These views filter public user data based on lists_public flag.
-- Using SECURITY INVOKER ensures they respect RLS policies on underlying tables.

-- Drop and recreate: public_user_profiles_view
DROP VIEW IF EXISTS public.public_user_profiles_view;
CREATE VIEW public.public_user_profiles_view
WITH (security_invoker = true)
AS
SELECT user_id, username, display_name, lists_public
FROM public.user_profiles
WHERE coalesce(lists_public, false) = true;

-- Drop and recreate: public_user_sets_view
DROP VIEW IF EXISTS public.public_user_sets_view;
CREATE VIEW public.public_user_sets_view
WITH (security_invoker = true)
AS
SELECT us.user_id, us.set_num, us.status
FROM public.user_sets us
JOIN public.user_profiles up ON up.user_id = us.user_id
WHERE coalesce(up.lists_public, false) = true;

-- Drop and recreate: public_user_minifigs_view
DROP VIEW IF EXISTS public.public_user_minifigs_view;
CREATE VIEW public.public_user_minifigs_view
WITH (security_invoker = true)
AS
SELECT um.user_id, um.fig_num, um.status
FROM public.user_minifigs um
JOIN public.user_profiles up ON up.user_id = um.user_id
WHERE coalesce(up.lists_public, false) = true;

-- Drop and recreate: public_user_lists_view
DROP VIEW IF EXISTS public.public_user_lists_view;
CREATE VIEW public.public_user_lists_view
WITH (security_invoker = true)
AS
SELECT ul.id, ul.user_id, ul.name, ul.is_system
FROM public.user_lists ul
JOIN public.user_profiles up ON up.user_id = ul.user_id
WHERE coalesce(up.lists_public, false) = true;

-- Drop and recreate: public_user_list_items_view
DROP VIEW IF EXISTS public.public_user_list_items_view;
CREATE VIEW public.public_user_list_items_view
WITH (security_invoker = true)
AS
SELECT uli.user_id, uli.list_id, uli.item_type, uli.set_num, uli.minifig_id
FROM public.user_list_items uli
JOIN public.user_profiles up ON up.user_id = uli.user_id
WHERE coalesce(up.lists_public, false) = true;

-- Drop and recreate: rb_inventory_parts_public
DROP VIEW IF EXISTS public.rb_inventory_parts_public;
CREATE VIEW public.rb_inventory_parts_public
WITH (security_invoker = true)
AS
SELECT
  inventory_id,
  part_num,
  color_id,
  quantity,
  is_spare,
  element_id,
  img_url
FROM public.rb_inventory_parts;

-- Ensure grants are in place
GRANT SELECT ON public.rb_inventory_parts_public TO anon, authenticated;


-- =============================================================================
-- FIX 2: Fix get_sets_with_minifigs function with proper search_path
-- =============================================================================
-- This function returns all sets that contain minifigs from the RB catalog.
-- It's used by bulk minifig mapping scripts to discover sets requiring BL sync.

CREATE OR REPLACE FUNCTION public.get_sets_with_minifigs()
RETURNS TABLE(set_num text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT inventory_id as set_num
  FROM public.rb_inventory_minifigs
  ORDER BY inventory_id;
$$;

COMMENT ON FUNCTION public.get_sets_with_minifigs IS 
  'Returns set_nums for all sets containing minifigures in the Rebrickable catalog';


-- =============================================================================
-- FIX 3: Move pg_trgm extension to extensions schema
-- =============================================================================
-- Extensions should live in a dedicated schema, not public.
-- This is a Supabase best practice for security and organization.

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move the extension (this preserves all existing indexes and operator classes)
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Note: Existing trigram indexes (idx_rb_sets_set_num_trgm, idx_rb_sets_name_trgm)
-- will continue to work because they reference the gin_trgm_ops operator class,
-- which is now located in extensions.gin_trgm_ops but remains accessible.


-- =============================================================================
-- FIX 4: Add explicit RLS policies for internal catalog tables
-- =============================================================================
-- These tables are internal catalog data accessed only via service_role.
-- Adding explicit policies documents this access pattern and satisfies the linter.

-- Policy: bl_minifig_parts (BrickLink minifig component parts)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_minifig_parts;
CREATE POLICY "Service role full access"
  ON public.bl_minifig_parts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bl_part_sets (BrickLink part→set mappings from identify)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_part_sets;
CREATE POLICY "Service role full access"
  ON public.bl_part_sets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bl_parts (BrickLink parts cache)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_parts;
CREATE POLICY "Service role full access"
  ON public.bl_parts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bl_set_minifigs (BrickLink set→minifig mappings)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_set_minifigs;
CREATE POLICY "Service role full access"
  ON public.bl_set_minifigs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bl_sets (BrickLink sets metadata and sync status)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_sets;
CREATE POLICY "Service role full access"
  ON public.bl_sets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bricklink_minifig_mappings (Global minifig RB→BL mappings)
DROP POLICY IF EXISTS "Service role full access" ON public.bricklink_minifig_mappings;
CREATE POLICY "Service role full access"
  ON public.bricklink_minifig_mappings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bricklink_minifigs (BrickLink minifig catalog)
DROP POLICY IF EXISTS "Service role full access" ON public.bricklink_minifigs;
CREATE POLICY "Service role full access"
  ON public.bricklink_minifigs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: part_id_mappings (RB→BL part ID mappings)
DROP POLICY IF EXISTS "Service role full access" ON public.part_id_mappings;
CREATE POLICY "Service role full access"
  ON public.part_id_mappings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: rate_limits (API rate limiting state)
DROP POLICY IF EXISTS "Service role full access" ON public.rate_limits;
CREATE POLICY "Service role full access"
  ON public.rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: rb_download_versions (Catalog ingestion version tracking)
DROP POLICY IF EXISTS "Service role full access" ON public.rb_download_versions;
CREATE POLICY "Service role full access"
  ON public.rb_download_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- COMMENTS: Document the changes
-- =============================================================================

COMMENT ON VIEW public.public_user_profiles_view IS 
  'Public view of user profiles (security_invoker=true respects RLS)';

COMMENT ON VIEW public.public_user_sets_view IS 
  'Public view of user sets where lists_public=true (security_invoker=true respects RLS)';

COMMENT ON VIEW public.public_user_minifigs_view IS 
  'Public view of user minifigs where lists_public=true (security_invoker=true respects RLS)';

COMMENT ON VIEW public.public_user_lists_view IS 
  'Public view of user lists where lists_public=true (security_invoker=true respects RLS)';

COMMENT ON VIEW public.public_user_list_items_view IS 
  'Public view of user list items where owner lists_public=true (security_invoker=true respects RLS)';

COMMENT ON VIEW public.rb_inventory_parts_public IS 
  'Public read surface for inventory part thumbnails (security_invoker=true respects RLS)';
