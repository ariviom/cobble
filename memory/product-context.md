# Product Context

## Problem
- Builders often have partial inventories for sets and need a fast way to reconcile required parts vs what they already own.
- Manually creating marketplace-compatible CSVs (Rebrickable, BrickLink wanted lists) is error-prone.
- Fragmented flows across reference sites/marketplaces slow down purchasing and planning.

## Users & Goals
- LEGO enthusiasts who buy/sell parts or restore sets.
- Want quick, accurate inventory views per set, with minimal inputs.
- Need reliable exports that import cleanly into Rebrickable and BrickLink.

## Experience Goals
- Fast: inventories for typical sets (< ~1000 parts) load in ~3s with clear loading states.
- Low-friction: simple search (set number with autocomplete), inline edits for owned quantities, bulk actions.
- Trustworthy: server-side API usage (no exposed keys), accurate exports, clear validation/errors.
- Accessible enough for MVP: keyboard-friendly controls, readable focus/labels.

## Scope & Boundaries (MVP)
- Core flows: search set → view inventory table → mark owned → see missing totals → export CSV (RB/BL).
- Optional pricing: user-triggered BrickLink estimates.
- Persistence: local-first (IndexedDB) with optional Supabase sync for signed-in users.
- Out of scope for now: auth-heavy features beyond basics, advanced analytics, BrickOwl/Pick-a-Brick, full image hosting; Identify and minifig mapping are complementary but not core to the CSV MVP.



