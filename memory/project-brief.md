# Project Brief

## Project Purpose
Brick Party — LEGO Set Piece Picker. A Next.js web app that lets a user enter a LEGO set number, fetch the set’s full parts inventory from Rebrickable (server-side), mark quantities they already own, compute missing quantities, and export a missing-parts list compatible with Rebrickable CSV and BrickLink CSV wanted list formats.

## User & Problem Context
Many builders own partial inventories from vintage or modern sets. They need a fast way to see the full parts list for a target set, subtract what they already have, and export the remaining (missing) list into marketplace-friendly formats for purchasing.

**Problems this solves**
- Fragmented workflows across reference sites and marketplaces.
- Manual reconciliation of owned vs required parts is slow and error-prone.
- Export formats for marketplaces are strict; small errors cause rejected imports.

## Core Experience
- User enters a set number (e.g., "1788-1", "6989", "21322") with autocomplete suggestions.
- On submit, the server fetches the parts inventory from Rebrickable via a proxy route.
- The app displays a sortable, virtualized table of part/color rows with images and quantities required.
- The user enters owned quantities per row; the app computes per-row and total missing values.
- The user exports the missing list as Rebrickable CSV or BrickLink CSV (wanted list) and can copy/download the file.
- Owned quantities and the last active set are saved to `localStorage` so the session resumes on return.

## User Experience Goals
- **Fast**: show inventories for sets ≤ 1000 parts in under ~3 seconds, with a loading spinner.
- **Low-friction**: minimal required inputs; clear validation and error handling.
- **Accurate**: export formats that reliably import into Rebrickable and BrickLink.
- **Accessible**: reasonable keyboard support and clear focus outlines.
- **Trustworthy**: server-only API usage, no client key exposure; no auth required for the MVP.

## Core Requirements
- Search by set number with autocomplete and validation (Rebrickable search). Fallback to direct lookup when a code is nonstandard.
- Server-only data access: Next.js Route Handlers proxy Rebrickable API using env `REBRICKABLE_API` (never exposed client-side).
- Inventory table per set with columns: Name, Color, Qty Required, Qty Owned (numeric), Qty Missing, Image.
- Table UX: sort by name, color, size; virtualized rendering for large inventories; filtering by Missing/Owned and by part categories/colors.
- Owned pieces UX: per-row numeric input, bulk actions (Mark all as owned / Clear all), and a pinned panel for tracking specific parts across sets.
- Missing-parts computation: `missing = max(0, required - owned)`; summary totals.
- Export formats:
  - Rebrickable CSV (per their import spec).
  - BrickLink CSV wanted list (single list). Wanted list name: "{setNumber} — {setName} — mvp". Default condition acceptable; toggle for new/used can come later.
- Optional pricing: user-triggered BrickLink price lookup at the set level ("Get prices") that fetches prices for all pieces and shows an aggregate total/range plus per-part links to BrickLink.
- Persistence: store owned quantities, user set-status flags, pinned pieces, and recent sets/searches locally via `localStorage`, keyed by set ID.

## Out of Scope (for MVP)
- User accounts and any authentication/authorization. (Planned next with Supabase.)
- Connecting external accounts (Rebrickable, BrickLink, BrickOwl) and importing collections.
- Advanced pricing analytics and rarity metrics (beyond the current BrickLink "Get prices" estimate).
- BrickOwl export and Pick-a-Brick integration.
- Analytics/metrics collection.
- Deployment concerns (local-only for MVP testing).

## Test Sets (manual acceptance)
- 1788 — Pirate Treasure Chest
- 6781 — SP-Striker
- 6989 — Mega Core Magnetizer
- 40597 — Scary Pirate Island
- 21322 — Pirates of Barracuda Bay
