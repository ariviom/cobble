# Current Improvement Plan

**Last Updated:** December 16, 2025  
**Status:** Active (minimal backlog)

---

## Summary

Most architectural improvements from the December 2025 scaling review have been completed. See `PREVIOUS_IMPROVEMENT_PLANS.md` for historical details.

| Risk Area                     | Severity    | Status                                     |
| ----------------------------- | ----------- | ------------------------------------------ |
| Multi-layer cache incoherence | 🔴 Critical | ✅ Resolved (targeted fixes)               |
| Sync queue race conditions    | 🟠 High     | ✅ Completed (TabCoordinator)              |
| CSRF protection gaps          | 🟠 High     | ✅ Completed                               |
| External API cascade failures | 🟠 High     | ✅ Completed (Rebrickable circuit breaker) |
| In-memory state leaks         | 🟡 Medium   | ✅ Verified (cleanup already in place)     |
| Service role privilege sprawl | 🟡 Medium   | ⏳ **Deferred** (see below)                |

---

## 🟡 Deferred: Service Role Privilege Sprawl

**Severity:** 🟡 Medium  
**Effort:** Medium (1 day)  
**ROI:** Medium - security hardening  
**Status:** Deferred to post-beta

### Problem

Service role client (bypasses RLS) is used in 15 files. Some may not need elevated privileges.

### Files Using Service Role

| File                                        | Reason             | Needs Service Role? |
| ------------------------------------------- | ------------------ | ------------------- |
| `app/api/minifigs/[figNum]/route.ts`        | Reads minifig data | 🟡 Audit needed     |
| `app/api/identify/sets/handlers/minifig.ts` | Reads catalog      | 🟡 Audit needed     |
| `app/lib/identify/blFallback.ts`            | Writes BL cache    | ✅ Yes              |
| `app/lib/services/billing.ts`               | User subscriptions | ✅ Yes              |
| `app/api/stripe/webhook/route.ts`           | Updates user data  | ✅ Yes              |
| `app/api/user/minifigs/route.ts`            | User data          | ✅ Yes              |

### Implementation Plan

**Step 1: Audit each usage**

For each file importing `getSupabaseServiceRoleClient`:

1. Check what tables are accessed
2. Verify if RLS policies would block the operation
3. If anon/auth client would work, switch to it

**Step 2: Add documentation comment**

```typescript
// When service role IS needed, document why:
// Uses service role because: Writes to bl_parts which has no anon policy
const supabase = getSupabaseServiceRoleClient();
```

### Acceptance Criteria

- [ ] Audit all 15 files using service role
- [ ] Switch to anon/auth client where possible
- [ ] Document reasoning for remaining service role usages
- [ ] Add lint warning for service role imports (optional)

### Why Deferred

This is a security hardening task, not a functional issue. The current usage is safe (service role is only used server-side), but reducing its footprint follows the principle of least privilege. Can be addressed post-beta when there's more time for careful auditing.

---

## Useful Commands

```bash
# Find service role usages
rg "getSupabaseServiceRoleClient" app/ --type ts -l

# Find all POST routes (for CSRF audit)
rg "export (async function |function |const )(POST|PUT|PATCH|DELETE)" app/api/ --type ts
```

---

## Related Documentation

- `PREVIOUS_IMPROVEMENT_PLANS.md` - Completed improvement work
- `CACHE_ARCHITECTURE_PLAN.md` - Detailed caching analysis
- `memory/system-patterns.md` - Caching strategy section

---

_Last updated: December 16, 2025_
