# Improvement checklist

## 2025-11-26 — Codebase review follow-ups

- [ ] Extract sub-pipelines from the identify backend into smaller pure helpers (RB candidate resolution, BL supersets fallback, BL-only fallback) and add a per-request budget to cap external calls.
- [ ] Improve Identify page UX with clearer sub-states (e.g., “Identifying…”, “Finding sets…”, “Using BrickLink-only data”) and consider debouncing rapid candidate/color changes.
- [ ] Refactor `useSupabaseOwned` into a lower-level owned-persistence service plus a higher-level migration coordinator hook, and add lightweight telemetry/logging for Supabase write failures.
- [ ] Centralize non-blocking error surfacing (e.g., toasts) for Supabase-backed flows like collection create/toggle and set status updates.
- [ ] Upgrade the modal implementation to full accessibility: focus trap, focus restoration, inert background, and robust `aria-labelledby` / `aria-describedby`.
- [ ] Tighten accessibility and keyboard support across complex controls (inventory filters, color pickers, identify chips): ensure proper roles, key handling, and ARIA labels.
- [ ] Add defensive rate limiting and/or feature flags for identify and pricing endpoints to prevent overuse of BrickLink/Rebrickable (per-IP and/or per-user limits).
- [ ] Cache “identify → sets” resolutions in Supabase keyed by normalized part/color identifiers to avoid repeating heavy identify pipelines.
- [ ] Introduce structured logging and basic metrics (per-route latency/error rates, cache hit/miss, external API throttling) to support higher scale and easier debugging.
- [ ] Enhance auth lifecycle handling by subscribing to Supabase `auth.onAuthStateChange` so hooks depending on `useSupabaseUser` react to in-session login/logout.
- [ ] Expand automated tests around identify and pricing flows (mocked RB/BL/Brickognize) and add end-to-end validation for CSV exports against Rebrickable/BrickLink import rules.


