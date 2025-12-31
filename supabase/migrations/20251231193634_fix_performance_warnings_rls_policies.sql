-- Migration: Fix 46 Performance Warnings from Supabase Linter
--
-- This migration addresses three categories of performance issues:
-- 1. Auth RLS InitPlan (16 warnings) - Wrap auth.uid() in SELECT to evaluate once per query
-- 2. Multiple Permissive Policies (27 warnings) - Consolidate overlapping policies
-- 3. Duplicate Indexes (3 warnings) - Drop redundant indexes
--
-- Summary of Changes:
-- - Fix 16 RLS policies that re-evaluate auth.uid() for each row
-- - Consolidate 27 duplicate permissive policies into single policies
-- - Drop 3 duplicate indexes

-- =============================================================================
-- PART 1: Fix Auth RLS InitPlan Issues (16 policies across 7 tables)
-- =============================================================================
-- Problem: Policies calling auth.uid() directly re-evaluate for every row
-- Solution: Wrap in (SELECT auth.uid()) to compute once per statement

-- -----------------------------------------------------------------------------
-- Table: user_lists (4 policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Select own lists" ON public.user_lists;
CREATE POLICY "Select own lists" 
  ON public.user_lists
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Insert own lists" ON public.user_lists;
CREATE POLICY "Insert own lists" 
  ON public.user_lists
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Update own lists" ON public.user_lists;
CREATE POLICY "Update own lists" 
  ON public.user_lists
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Delete own lists" ON public.user_lists;
CREATE POLICY "Delete own lists" 
  ON public.user_lists
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Table: user_list_items (3 policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Select own list items" ON public.user_list_items;
CREATE POLICY "Select own list items" 
  ON public.user_list_items
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Insert own list items" ON public.user_list_items;
CREATE POLICY "Insert own list items" 
  ON public.user_list_items
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Delete own list items" ON public.user_list_items;
CREATE POLICY "Delete own list items" 
  ON public.user_list_items
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Table: user_minifigs (5 policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Select own minifigs" ON public.user_minifigs;
CREATE POLICY "Select own minifigs" 
  ON public.user_minifigs
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Insert own minifigs" ON public.user_minifigs;
CREATE POLICY "Insert own minifigs" 
  ON public.user_minifigs
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Update own minifigs" ON public.user_minifigs;
CREATE POLICY "Update own minifigs" 
  ON public.user_minifigs
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Delete own minifigs" ON public.user_minifigs;
CREATE POLICY "Delete own minifigs" 
  ON public.user_minifigs
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Table: user_feedback (2 policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.user_feedback;
CREATE POLICY "Users can insert their own feedback"
  ON public.user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own feedback" ON public.user_feedback;
CREATE POLICY "Users can view their own feedback"
  ON public.user_feedback
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Table: billing_customers (1 policy)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "billing_customers_owner_select" ON public.billing_customers;
CREATE POLICY "billing_customers_owner_select"
  ON public.billing_customers
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Table: billing_subscriptions (1 policy)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "billing_subscriptions_owner_select" ON public.billing_subscriptions;
CREATE POLICY "billing_subscriptions_owner_select"
  ON public.billing_subscriptions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Table: feature_overrides (1 policy)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "feature_overrides_owner_select" ON public.feature_overrides;
CREATE POLICY "feature_overrides_owner_select"
  ON public.feature_overrides
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);


-- =============================================================================
-- PART 2: Consolidate Multiple Permissive Policies (27 warnings)
-- =============================================================================
-- Problem: Multiple SELECT policies for the same role/action are all evaluated
-- Solution: Consolidate into single policies with OR logic

-- -----------------------------------------------------------------------------
-- Table: rb_inventory_parts (2 duplicate policies, both with "true" condition)
-- -----------------------------------------------------------------------------
-- Drop the newer duplicate policy, keep the original
DROP POLICY IF EXISTS "Allow public read of inventory part images" ON public.rb_inventory_parts;
-- Keep: "Allow read rb_inventory_parts" (from 20251203054508)

-- -----------------------------------------------------------------------------
-- Table: user_profiles (3 policies → 1 consolidated)
-- -----------------------------------------------------------------------------
-- Consolidate: "Select user profiles", "Select public profiles when lists public", 
-- and the policy from 20251210090000 (public_profiles_select_public)
DROP POLICY IF EXISTS "Select user profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Select public profiles when lists public" ON public.user_profiles;
DROP POLICY IF EXISTS "public_profiles_select_public" ON public.user_profiles;

CREATE POLICY "Select user profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR coalesce(lists_public, false) = true
  );

-- -----------------------------------------------------------------------------
-- Table: user_sets (3 policies → 1 consolidated)
-- -----------------------------------------------------------------------------
-- Consolidate: "Select user sets", "Select sets when profile lists public",
-- and "public_user_sets_select_public"
DROP POLICY IF EXISTS "Select user sets" ON public.user_sets;
DROP POLICY IF EXISTS "Select sets when profile lists public" ON public.user_sets;
DROP POLICY IF EXISTS "public_user_sets_select_public" ON public.user_sets;

CREATE POLICY "Select user sets"
  ON public.user_sets
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.user_id = public.user_sets.user_id
        AND coalesce(p.lists_public, false) = true
    )
  );

-- -----------------------------------------------------------------------------
-- Table: user_minifigs (3 policies → 1 consolidated)
-- -----------------------------------------------------------------------------
-- Consolidate: "Select own minifigs" (already fixed above), 
-- "Select minifigs when profile lists public", and "public_user_minifigs_select_public"
DROP POLICY IF EXISTS "Select own minifigs" ON public.user_minifigs;
DROP POLICY IF EXISTS "Select minifigs when profile lists public" ON public.user_minifigs;
DROP POLICY IF EXISTS "public_user_minifigs_select_public" ON public.user_minifigs;

CREATE POLICY "Select user minifigs"
  ON public.user_minifigs
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.user_id = public.user_minifigs.user_id
        AND coalesce(p.lists_public, false) = true
    )
  );

-- -----------------------------------------------------------------------------
-- Table: user_lists (3 policies → 1 consolidated)
-- -----------------------------------------------------------------------------
-- Consolidate: "Select own lists" (already fixed above),
-- "Select lists when profile lists public", and "public_user_lists_select_public"
DROP POLICY IF EXISTS "Select own lists" ON public.user_lists;
DROP POLICY IF EXISTS "Select lists when profile lists public" ON public.user_lists;
DROP POLICY IF EXISTS "public_user_lists_select_public" ON public.user_lists;

CREATE POLICY "Select user lists"
  ON public.user_lists
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.user_id = public.user_lists.user_id
        AND coalesce(p.lists_public, false) = true
    )
  );

-- -----------------------------------------------------------------------------
-- Table: user_list_items (3 policies → 1 consolidated)
-- -----------------------------------------------------------------------------
-- Consolidate: "Select own list items" (already fixed above),
-- "Select list items when profile lists public", and "public_user_list_items_select_public"
DROP POLICY IF EXISTS "Select own list items" ON public.user_list_items;
DROP POLICY IF EXISTS "Select list items when profile lists public" ON public.user_list_items;
DROP POLICY IF EXISTS "public_user_list_items_select_public" ON public.user_list_items;

CREATE POLICY "Select user list items"
  ON public.user_list_items
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.user_id = public.user_list_items.user_id
        AND coalesce(p.lists_public, false) = true
    )
  );


-- =============================================================================
-- PART 3: Drop Duplicate Indexes (3 warnings)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: bl_minifig_parts
-- -----------------------------------------------------------------------------
-- Keep: bl_minifig_parts_minifig_idx (from 20251229100047_bricklink_minifig_primary.sql)
-- Drop: idx_bl_minifig_parts_minifig_no (from 20251231173222_drop_minifig_fk_constraint.sql)
DROP INDEX IF EXISTS public.idx_bl_minifig_parts_minifig_no;

-- -----------------------------------------------------------------------------
-- Table: bl_set_minifigs
-- -----------------------------------------------------------------------------
-- Keep: bl_set_minifigs_minifig_idx (from 20251229100047_bricklink_minifig_primary.sql)
-- Drop: idx_bl_set_minifigs_minifig_no (from 20251231173222_drop_minifig_fk_constraint.sql)
DROP INDEX IF EXISTS public.idx_bl_set_minifigs_minifig_no;

-- -----------------------------------------------------------------------------
-- Table: rb_set_parts
-- -----------------------------------------------------------------------------
-- Keep: idx_rb_set_parts_part_num (from 20251207020024_catalog_search_identify_indexes.sql)
-- Drop: rb_set_parts_part_num_idx (from 20251123004432_catalog_schema.sql, should have been dropped)
DROP INDEX IF EXISTS public.rb_set_parts_part_num_idx;


-- =============================================================================
-- COMMENTS: Document the optimizations
-- =============================================================================

COMMENT ON POLICY "Select user profiles" ON public.user_profiles IS 
  'Consolidated policy: own data or public profiles. Uses (SELECT auth.uid()) for performance.';

COMMENT ON POLICY "Select user sets" ON public.user_sets IS 
  'Consolidated policy: own sets or public profile sets. Uses (SELECT auth.uid()) for performance.';

COMMENT ON POLICY "Select user minifigs" ON public.user_minifigs IS 
  'Consolidated policy: own minifigs or public profile minifigs. Uses (SELECT auth.uid()) for performance.';

COMMENT ON POLICY "Select user lists" ON public.user_lists IS 
  'Consolidated policy: own lists or public profile lists. Uses (SELECT auth.uid()) for performance.';

COMMENT ON POLICY "Select user list items" ON public.user_list_items IS 
  'Consolidated policy: own list items or public profile list items. Uses (SELECT auth.uid()) for performance.';
