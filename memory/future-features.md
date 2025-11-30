# Future Features

This document captures potential future enhancements with brief descriptions and rough complexity ratings.

Legend:
- Implementation complexity: Low / Medium / High
- UI complexity: Low / Medium / High

## Category settings and parent categories
- **Description**: Introduce a curated parent-category taxonomy and a Settings page to toggle grouping by parent category vs full categories, and to hide selected categories/subcategories. Unchecked categories could appear in a "Misc." tab.
- **Notes**: Requires a stable mapping from part name/IDs to categories → parent categories. Persist user settings (localStorage for MVP; later per-user if auth exists).
- **Implementation complexity**: Medium–High (taxonomy mapping, persistence, filter integration, tabs generation).
- **UI complexity**: Medium (settings UI, tabs reflecting filters, indicators for hidden categories).

## Per-user set inventory: owned / wanted / can build / partial sets
- **Description**: Maintain a local inventory of sets a user interacts with, tagged as Owned, Wanted, Can Build, Partial. "Can Build" indicates enough pieces without an original purchase or instructions. Track toggles for owning instructions and box.
- **Notes**: No auth in MVP → local-only persistence. Requires set metadata storage, derived status (can build), and user controls to add/remove. Later: sync with account.
- **Implementation complexity**: High (data model, derived state from parts/owned, persistence, UI flows).
- **UI complexity**: Medium–High (set list views, status badges, toggles for instructions/box, remove actions).

## Piece ID via Google Lens → search and sets containing the piece
- **Description**: Allow capturing/choosing a photo; use Google Lens (or similar Vision API) to identify the part, then search BrickLink/Rebrickable by the identified part and filter by color; list sets containing the piece. Allow users to combine multiple pieces (use pieces from recent searches) to narrow down to a single set.
- **Notes**: Requires image capture/upload, vision API integration, mapping to marketplace IDs, color filtering, and set lookup. Consider privacy and API quotas; color disambiguation is critical.
- **Implementation complexity**: High (vision integration, mappings, search pipelines).
- **UI complexity**: Medium (capture flow, results list, color filter controls).

## Piece detail/kebab menu: alternates, price history, substitute piece
- **Description**: Add a kebab menu on each part row to display additional info (alternates, price history) and allow a "substitute" selection of a similar piece. Substituted parts should visually indicate they are not the original.
- **Notes**: Requires data sources for alternates and pricing; substitution should affect missing/owned logic and be undoable.
- **Implementation complexity**: Medium–High (data integration, state updates for substitution, persistence).
- **UI complexity**: Medium (menus, detail panel/modal, substitution indicators).

## Find view for real-world sorting (tally marks and large hit targets)
- **Description**: A mode focused on physically finding parts: large increment-only control (with small minus), visual checkboxes, and tally marks in groups of 5 that auto-check when complete. Optionally replaces the numeric control.
- **Notes**: Needs a dedicated view state and controls per item; should be keyboard/touch friendly and highly accessible.
- **Implementation complexity**: Medium (view state, controls, tally logic).
- **UI complexity**: Medium–High (responsive large controls, clear affordances, accessibility).

## PDF generator with drop zones for found parts
- **Description**: Generate a printable PDF that organizes required parts into grid "drop zones" sized by quantity and piece size for physical sorting.
- **Notes**: Requires server/client PDF generation, a layout algorithm for zones, and image mapping. Consider page size, margins, and printer-friendly styles.
- **Implementation complexity**: High (PDF generation, layout algorithms, assets).
- **UI complexity**: Medium (export flow, preview/download controls).

