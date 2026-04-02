# Landing Page Redesign

## Goal

Rewrite the landing page to tell a clear story: you have a pile of mixed LEGO bricks and you want to rebuild sets from it. The page should highlight core free features, then upsell Plus entitlements, following a linear narrative that mirrors the user's decision journey.

## Target Audience

People with bulk LEGO collections — either childhood sets they want to reassemble or bulk lot purchases they want to sort through. The common thread is **a pile of mixed bricks and a desire to build specific sets from it**.

## Page Structure (Top to Bottom)

### Section 1: Hero

- **Background:** Yellow with LEGO stud pattern overlay (existing treatment)
- **Headline:** "Turn your pile of bricks back into sets"
- **Subheadline:** "Pick a set, find the pieces, track your progress."
- **CTA:** Single primary button — "Get started" (links into app)
- **Small text below CTA:** "Free to use — no account required"
- **Removed:** "View pricing" secondary button, stats section as standalone

### Section 2: How It Works

- **Layout:** 3 steps in horizontal row with numbered circles and icons (same layout pattern as current)
- **Steps:**
  1. **Pick a set** — "Search by set number or name from our complete LEGO catalog."
  2. **Find your pieces** — "Filter and sort by color, size, and category to dig through your pile efficiently."
  3. **Track your progress** — "Mark pieces as you find them and watch your build come together."
- **Changes from current:** Step copy rewritten to emphasize the pile-to-built-set journey. "Export what's missing" removed as a step (it's a feature card instead). No set/piece count stats.

### Section 3: Features (Free)

- **Section heading:** "Features"
- **Layout:** 6 cards in 3-column responsive grid (same layout as current)
- **Each card:** Autoplay muted looping video preview + title + short description
- **Cards in order:**
  1. **Search any set** — "Look up any LEGO set by number or name and instantly see its full parts inventory."
  2. **Filter & Sort** — "Narrow down pieces by color, size, and category to find what you need fast."
  3. **Track owned pieces** — "Mark which pieces you've found. Your progress is saved locally — no account needed."
  4. **Identify parts by photo** — "Snap a photo of a mystery piece and let AI identify the part number."
  5. **Search Party** — "Invite friends or family to help sort through a pile together in real time."
  6. **Export missing pieces** — "Export your missing parts as a Rebrickable CSV or BrickLink wanted list."
- **Changes from current:** "BrickLink pricing" card removed, replaced by "Filter & Sort." Card order tells a workflow story. Autoplay video loops replace static icons.

### Section 4: Do More with Plus

- **Background:** Purple-toned to visually differentiate from free features and signal premium tier
- **Headline:** "Do more with Plus"
- **Subheadline:** "Cloud sync, rarity indicators, and unlimited usage."
- **Layout:** 6 cards in same grid pattern as free features, with elevated visual treatment (Plus badge, richer styling within existing design system)
- **Each card:** Autoplay muted looping video preview + title + short description
- **Cards:**
  1. **Cloud sync** — "Your collection and tracked sets on any device. Pick up right where you left off."
  2. **Part rarity insights** — "See which pieces are rare or hard to find so you can prioritize your search."
  3. **Unlimited identifications** — "Identify as many parts as you want — no daily limits."
  4. **Unlimited Search Parties** — "Host as many group sorting sessions as you need."
  5. **Unlimited tabs** — "Open as many sets as you want and switch between them freely."
  6. **Unlimited lists** — "Create as many custom lists as you need to organize your collection."
- **CTAs below cards:** "Try it free" (primary button, links into app where upgrade flow handles trial) + "See pricing" (secondary link, anchors to pricing section)
- **This section is new** — does not exist on current landing page.

### Section 5: Pricing

- **Layout:** Same structure as current — monthly/yearly toggle, feature comparison table, pricing cards for Free ($0) and Plus ($8/mo or $80/yr)
- **Changes to comparison table:**
  - Add "Mobile-friendly" row — checkmark for both Free and Plus
  - Add "Dark mode" row — checkmark for both Free and Plus
  - "BrickLink pricing" stays as-is (included for both tiers)
- **CTA buttons:** "Get started" on Free card, "Get Plus" on Plus card

### Section 6: Bottom CTA

- **Background:** Blue (existing treatment)
- **Headline:** "Ready to find your favorite sets?"
- **CTA:** Single "Get started" button (mirrors hero CTA)

## Sections Removed

- **Stats section** ("20,000+ sets, 1M+ parts, 100% free") — removed entirely, no replacement
- **Social proof** — intentionally omitted at this stage

## CTA Strategy

CTAs are distributed throughout the page with contextual language:

- **Hero:** "Get started" — generic entry point
- **Plus section:** "Try it free" + "See pricing" — upsell with low friction
- **Pricing cards:** "Get started" (Free) / "Get Plus" (Plus) — conversion
- **Bottom:** "Get started" — catch engaged scrollers

All "Get started" / "Try it free" CTAs link into the app. Auth prompts and Plus upgrade flows are handled in-app, not on the landing page.

## Video Previews

- All 12 feature cards (6 free + 6 Plus) will have autoplay muted looping video previews
- Videos are short screencasts demonstrating each feature in action
- Videos will need to be recorded separately — this spec covers the component/layout work, not video production
- Cards should gracefully handle missing videos (fallback to existing icon treatment) during development

## Visual Design Notes

- Existing LEGO-themed design system (CeraPro font, brand colors, stud pattern, brick button depth) carries forward unchanged
- Purple background on Plus section is the main new visual element — should use brand purple (`#4d2f93`) or a tinted variant
- Plus cards get subtle elevated treatment (badge, border accent, or background shift) while staying within established card patterns
- Angled SVG dividers between sections continue as-is
- Responsive: 3-column grid → 2-column → 1-column on mobile for feature cards

## Navigation

- Sticky nav remains unchanged
- "Pricing" link continues to anchor to `#pricing`
- No new nav items needed
