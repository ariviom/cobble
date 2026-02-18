-- Delete stale feature flag seeds that are no longer used:
-- - pricing.full_cached: BrickLink pricing is now free for all users (BL API ToS compliance)
-- - bricklink.byo_key: Pro tier deferred; feature not yet implemented
-- - mocs.custom: Pro tier deferred; feature not yet implemented
DELETE FROM feature_flags
WHERE key IN ('pricing.full_cached', 'bricklink.byo_key', 'mocs.custom');

-- Also clean up any user-level overrides referencing these removed flags
DELETE FROM feature_overrides
WHERE feature_key IN ('pricing.full_cached', 'bricklink.byo_key', 'mocs.custom');
