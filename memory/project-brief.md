# Project Brief

## Project Purpose
Cobble — LEGO Set Piece Picker. A Next.js web app that lets a user enter a LEGO set number, fetch the set’s full parts inventory from Rebrickable (server-side), mark quantities they already own, compute missing quantities, and export a missing-parts list compatible with Rebrickable CSV and BrickLink CSV wanted list formats.

## Core Requirements
- Search by set number with autocomplete and validation (Rebrickable search). Fallback to direct lookup when a code is nonstandard.
- Server-only data access: Next.js Route Handlers proxy Rebrickable API using env `REBRICKABLE_API` (never exposed client-side).
- Inventory table per set with columns: Name, Color, Qty Required, Qty Owned (numeric), Qty Missing, Image.
- Table UX: sort by any column, virtualized rendering for large inventories.
- Owned pieces UX: per-row numeric input, bulk actions (Mark all as owned / Clear all).
- Missing-parts computation: `missing = max(0, required - owned)`; summary totals.
- Export formats (MVP):
  - Rebrickable CSV (per their import spec).
  - BrickLink CSV wanted list (single list). Wanted list name: "{setNumber} — {setName} — mvp". Default condition acceptable; toggle for new/used can come later.
- Persistence: store owned quantities and last viewed set locally via `localStorage`, keyed by set ID.
- Performance: initial inventory load for sets ≤ 1000 parts should target < 3 seconds; show loading spinner.
- Accessibility: basic keyboard navigation, labels, and focus states.
- Error handling: graceful states for unknown sets, rate limits, and missing inventory; server-side retries as reasonable.

## Out of Scope (for MVP)
- User accounts and any authentication/authorization.
- Connecting external accounts (Rebrickable, BrickLink, BrickOwl) and importing collections.
- Pricing (cost estimates) and rarity metrics.
- BrickOwl export and Pick-a-Brick integration.
- Analytics/metrics collection.
- Deployment concerns (local-only for MVP testing).

## Test Sets (manual acceptance)
- 1788 — Pirate Treasure Chest
- 6781 — SP-Striker
- 6989 — Mega Core Magnetizer
- 40597 — Scary Pirate Island
- 21322 — Pirates of Barracuda Bay
