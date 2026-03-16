# Onboarding Tour Design Spec

## Overview

A Stripe-style checklist tour that guides users through Brick Party's key features. The tour appears from first visit, with an anonymous sign-up prompt that transitions to a full interactive checklist after authentication. Completion is automatic, order is flexible, and the UI is non-blocking.

## Auth Split

### Anonymous Users

A card inviting the user to create an account for the full tour experience. Most checklist items require authentication, so the anonymous state is a sign-up prompt rather than a functional checklist.

Content: "Tour Brick Party" header, brief description ("Create an account to get a guided tour of the app's features"), "Create account" button, and a "Skip" dismiss link.

Anonymous users do not see the checklist, so no completion tracking occurs before sign-up. The tour begins fresh after account creation.

### Authenticated Users

The full checklist with all items unlocked. Transition from anonymous to authenticated is immediate — after sign-up, the card becomes the checklist on next render.

## Checklist Items

All items are order-independent. Completion is automatic, detected from existing app hooks and components.

| #   | Item                         | ID                          | Route                                                        | Requires Auth | Detection                                                         |
| --- | ---------------------------- | --------------------------- | ------------------------------------------------------------ | ------------- | ----------------------------------------------------------------- |
| 1   | Search for a set             | `search_set`                | `/search`                                                    | No            | Query submitted with results returned                             |
| 2   | Add a set to your collection | `add_set`                   | `/sets`                                                      | Yes           | Set marked as owned via `setOwned`                                |
| 3   | Identify a part              | `identify_part`             | `/identify`                                                  | Yes           | Successful identification result received in `IdentifyClient.tsx` |
| 4   | Mark a piece found           | `mark_piece`                | Last viewed set via `getRecentSets()` (or `/search` if none) | Yes           | Parent: completes when `mark_piece_select` is done                |
| 4a  | → Select a part found        | `mark_piece_select`         | —                                                            | Yes           | Any owned quantity changed                                        |
| 4b  | → Filter by color            | `mark_piece_filter_color`   | —                                                            | Yes           | Color filter applied                                              |
| 4c  | → Group by category          | `mark_piece_group_category` | —                                                            | Yes           | Category grouping toggled                                         |
| 5   | Start a Search Party         | `start_search_party`        | `/sets`                                                      | Yes           | Session created                                                   |
| 6   | Review account settings      | `review_settings`           | `/account`                                                   | Yes           | Page visited                                                      |

### Subtask Behavior

"Mark a piece found" has three subtasks. They are independent and can be completed in any order. The parent item completes when `mark_piece_select` is done. The filter/group subtasks are discovery items — bonus exploration, not required for parent completion.

### "Mark a piece found" Edge Case

If the user hasn't viewed a set yet, the modal shows an additional line ("Add a set first") and the button reads "Go to Search" routing to `/search`. Once they've viewed a set (determined via `getRecentSets()` from `app/store/recent-sets.ts` or the `useRecentSets` hook), it routes to that set.

## UI Design

### Positioning

- **Mobile:** Fixed bottom card, above the navigation bar
- **Desktop:** Fixed bottom-right floating card
- **Z-index:** ~70 (above control bars at z-40/50, toasts at z-60, but below modals at z-80 and nav at z-100). On mobile, position with `bottom: var(--spacing-nav-height)` to sit above the nav bar.

### Card States

| State         | Appearance                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Expanded**  | Full checklist with all items, progress bar, dismiss link                                  |
| **Collapsed** | Slim bottom bar (mobile) / corner widget (desktop) showing progress (e.g., "3/6 complete") |
| **Dismissed** | Hidden. Re-enable in account settings                                                      |
| **Completed** | "You're all set!" message, click to dismiss permanently                                    |

### Checklist Item Layout

Each item shows:

- Checkbox (filled when complete, empty when pending)
- Label text (regular weight)
- Subtext (smaller, lighter — describes the action in more detail)
- Completed items are visually muted with a checkmark

### Clicking a Checklist Item

1. Modal opens in-place (before navigation), using the existing `Modal` component (which portals to `document.body`) to avoid z-index stacking context issues
2. Modal contains: title, description, optional looping video (no audio), "Go to [destination]" button
3. User clicks "Go to \_\_\_" → modal closes → navigates to route → checklist collapses
4. User performs the action → step auto-completes → checklist updates

### Dismiss Flow

- Small text link at the bottom of the checklist: "Skip tour" or similar
- Dismissing replaces the checklist with a note about re-enabling in account settings
- The note is then dismissable itself

### Completion Flow

- When all items are complete, the checklist transforms to "You're all set!" message
- Click to dismiss permanently

## Data Model & Persistence

### Zustand Store

```ts
type OnboardingState = {
  completedSteps: string[]; // completed item IDs (including subtask IDs)
  dismissed: boolean; // explicitly dismissed
  collapsed: boolean; // minimized but not dismissed (per-device, not synced to Supabase)
};
```

### Persistence Layers

| User state                     | Read from                                        | Write to                            |
| ------------------------------ | ------------------------------------------------ | ----------------------------------- |
| Anonymous                      | localStorage                                     | localStorage                        |
| Authenticated, first load      | Supabase → merge with localStorage → update both | Both                                |
| Authenticated, ongoing         | Zustand (in-memory)                              | localStorage + Supabase (debounced) |
| Logout                         | localStorage flag remains                        | —                                   |
| New sign-in, incomplete record | Supabase overrides local flag                    | —                                   |

### Supabase Storage

Store onboarding progress in the existing `user_preferences.settings` JSONB column under an `onboarding` key. This avoids a new migration since `user_preferences` already has full CRUD RLS policies and is the established pattern for user-specific settings.

```json
{
  "settings": {
    "onboarding": {
      "completedSteps": ["search_set", "add_set"],
      "dismissed": false
    }
  }
}
```

### Multi-Device / Multi-User Handling

- Authenticated users: Supabase is source of truth. Completing on one device reflects everywhere.
- localStorage keeps a per-user flag (`onboarding_completed_{userId}`). A new user signing in on the same device with an incomplete Supabase record overrides the local flag to show the tour.
- Post-completion: localStorage flag persists after logout so returning visitors don't re-trigger the tour on that device.

## Architecture

### New Files

| File                                             | Purpose                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `app/store/onboarding.ts`                        | Zustand store — completedSteps, dismissed, collapsed                       |
| `app/components/onboarding/TourCard.tsx`         | Main container — auth split, expanded/collapsed/dismissed/completed states |
| `app/components/onboarding/TourChecklist.tsx`    | Checklist UI with items and progress bar                                   |
| `app/components/onboarding/TourSignupPrompt.tsx` | Anonymous state — sign-up invitation                                       |
| `app/components/onboarding/TourItemModal.tsx`    | Modal for checklist items (description, optional video, "Go to" button)    |
| `app/components/onboarding/tourConfig.ts`        | Static checklist item definitions                                          |
| `app/hooks/useOnboarding.ts`                     | Hook: `complete(itemId)`, `dismiss()`, `collapse()`, progress state        |
| `app/hooks/useOnboardingSync.ts`                 | Supabase sync — merge on login, debounced writes                           |

### Integration Points

Each is a one-liner `onboarding.complete(id)` call added to existing code:

| Location                                                     | Completion call                                    |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `SearchResults.tsx` (on successful search result fetch)      | `onboarding.complete('search_set')`                |
| `useUserSetsStore.setOwned`                                  | `onboarding.complete('add_set')`                   |
| `IdentifyClient.tsx` (on successful identification response) | `onboarding.complete('identify_part')`             |
| Owned store                                                  | `onboarding.complete('mark_piece_select')`         |
| Inventory filter controls                                    | `onboarding.complete('mark_piece_filter_color')`   |
| Inventory grouping controls                                  | `onboarding.complete('mark_piece_group_category')` |
| Group session hook                                           | `onboarding.complete('start_search_party')`        |
| Account page                                                 | `onboarding.complete('review_settings')` on mount  |

### Account Settings Integration

A toggle or button on the account page to re-enable the tour if previously dismissed. Clicking it sets `dismissed: false` and the tour card appears immediately in its expanded state. Progress is resumed (previously completed items stay checked).

## Video Content

### Recording Pipeline (separate concern)

- **Tooling:** Playwright + CDP `Page.startScreencast` + FFmpeg
- **Scripts:** `scripts/videos/` — one TypeScript file per video, driving the real app DOM
- **Output:** `scripts/videos/output/` (gitignored) — MP4 files for review
- **Re-run:** When UI changes, re-run scripts for fresh footage with identical timing
- **Hosting:** Determined later. Videos reviewed, copied to CDN or public folder, URLs wired up.

### Videos per Checklist Item

| Item                         | Video content                                |
| ---------------------------- | -------------------------------------------- |
| Search for a set             | Type a query, results appear, click a result |
| Add a set to your collection | Open a set, add to a list                    |
| Identify a part              | Open identify, capture/upload, see result    |
| Select a part found          | Click quantity control on a part             |
| Filter by color              | Open color filter, select a color            |
| Group by category            | Toggle category grouping                     |
| Start a Search Party         | Create a session, show the lobby             |
| Review account settings      | Navigate settings, show key options          |

### Modal Behavior

The onboarding modal accepts an optional video prop. If no video URL is provided, the modal shows only the description and "Go to" button — no placeholder or empty state.

## Not In Scope

- Audio on videos
- Gamification or rewards beyond the checklist completion
- A/B testing of onboarding flows
- Analytics on tour engagement (can be added later)
- The video recording pipeline implementation (separate project)
