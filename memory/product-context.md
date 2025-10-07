# Product Context

## Why This Project Exists

Help builders complete LEGO sets efficiently. Many users own partial inventories from vintage or modern sets. They need a fast way to see the full parts list for a target set, subtract what they already have, and export the remaining (missing) list into marketplace-friendly formats for purchasing.

## Problems It Solves

- Fragmented workflows across reference sites and marketplaces.
- Manual reconciliation of owned vs required parts is slow and error-prone.
- Export formats for marketplaces are strict; small errors cause rejected imports.

## How It Should Work

- User enters a set number (e.g., "1788-1", "6989", "21322").
- Autocomplete suggests valid set numbers; on submit, the server fetches the parts inventory from Rebrickable.
- The app displays a sortable, virtualized table of part/color rows with images and quantities required.
- The user enters owned quantities (per-row). The app computes per-row and total missing values.
- The user exports the missing list as Rebrickable CSV or BrickLink CSV (wanted list) and can copy/download the file.
- Owned quantities and the last active set are saved to localStorage so the session resumes on return.

## User Experience Goals

- Fast: target < 3 seconds to show inventories for ≤ 1000 parts, with loading spinner.
- Frictionless: minimal required inputs; clear validation and error handling.
- Accurate: export formats that reliably import into Rebrickable and BrickLink.
- Accessible: reasonable keyboard support and clear focus outlines.
- Trustworthy: no auth in MVP; server-only API usage; no client key exposure.