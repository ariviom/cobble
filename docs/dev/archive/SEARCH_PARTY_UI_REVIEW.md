# Search Party UI Review

**Date:** February 2026
**Status:** In Progress

## Issues Found

### Host Side

1. **"Checking Availability" loading text** — Nonsensical from user's perspective. Should say "Loading" instead.
2. **Two-person icon color** — Blue instead of theme color in the modal. Easy fix.
3. **Excessive console logs on session start** — Tons of event logs for Supabase Realtime. Investigate whether this is hammering the endpoint or just noisy logging.
4. **Started session modal layout** — QR code is fine, but:
   - Session code messaging is above the QR, code is below
   - "Copy Link" button next to the code could be confused with copying the code itself (proximity issue)
   - On smaller phones, modal content is cut off (too large for viewport)
5. **No copy confirmation** — When user hits "Copy Link", there's no visual feedback that the link was copied.

### Joiner Side

6. ~~**CRITICAL: `useInventoryData must be used within an InventoryProvider`**~~ — **Fixed:** `SetTopBar` now uses `useOptionalInventoryData()` which returns null outside `InventoryProvider`. Pre-join state shows just "{numParts} parts" without owned count.

### Not Yet Reviewed

- [ ] Join page UX (instructions, where to enter code)
- [ ] In-session participant experience
- [ ] Reconnection handling UX
- [ ] End session flow
- [ ] Mobile-specific layout issues beyond modal sizing
