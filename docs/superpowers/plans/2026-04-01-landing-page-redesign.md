# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the landing page to tell a pile-to-built-set story, showcase 6 free features with video cards, add a new Plus upsell section with 6 Plus features, and update all copy/CTAs per the spec.

**Architecture:** The landing page is a single client component (`LandingPage.tsx`) that composes section-level components. We'll extract the feature card into a reusable component (shared between free and Plus sections), create a new `PlusSection` component, and update copy/structure inline in `LandingPage.tsx`. The `PricingSection` gets two new rows. Video assets use the existing `public/tour-videos/` convention with icon fallback.

**Tech Stack:** Next.js, React, Tailwind CSS v4, lucide-react icons, existing `Button`/`Badge` UI components

**Spec:** `docs/superpowers/specs/2026-04-01-landing-page-redesign.md`

---

## File Structure

| File                                        | Action | Responsibility                                                                         |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `app/components/landing/FeatureCard.tsx`    | Create | Reusable feature card with video preview + icon fallback                               |
| `app/components/landing/PlusSection.tsx`    | Create | "Do more with Plus" section with purple background and 6 Plus cards                    |
| `app/components/landing/LandingPage.tsx`    | Modify | Update hero, how-it-works, features, remove stats, add Plus section, update bottom CTA |
| `app/components/landing/LandingNav.tsx`     | Modify | Fix `#plus` anchor to `#how-it-works`, add Plus nav link                               |
| `app/components/landing/PricingSection.tsx` | Modify | Add mobile-friendly and dark mode rows to comparison table                             |

---

## Task 1: Create the FeatureCard Component

**Files:**

- Create: `app/components/landing/FeatureCard.tsx`

This component is shared between the free Features section and the Plus section. It renders an autoplay muted looping video with icon fallback.

- [ ] **Step 1: Create FeatureCard component**

```tsx
// app/components/landing/FeatureCard.tsx
'use client';

import type { LucideIcon } from 'lucide-react';

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  videoSrc?: string;
  variant?: 'default' | 'plus';
};

export function FeatureCard({
  icon: Icon,
  title,
  description,
  videoSrc,
  variant = 'default',
}: FeatureCardProps) {
  const isPlus = variant === 'plus';

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-xl border shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
        isPlus
          ? 'border-white/20 bg-white/10 backdrop-blur-sm'
          : 'border-neutral-200 bg-white'
      }`}
    >
      {/* Video preview area */}
      <div
        className={`relative aspect-video w-full overflow-hidden ${
          isPlus ? 'bg-white/5' : 'bg-neutral-100'
        }`}
      >
        {videoSrc ? (
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              className={`size-10 ${isPlus ? 'text-white/40' : 'text-neutral-300'}`}
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col p-5">
        <h3
          className={`text-lg font-bold ${isPlus ? 'text-white' : 'text-neutral-900'}`}
        >
          {title}
        </h3>
        <p
          className={`mt-2 text-sm leading-relaxed ${
            isPlus ? 'text-white/70' : 'text-neutral-600'
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to FeatureCard

- [ ] **Step 3: Commit**

```bash
git add app/components/landing/FeatureCard.tsx
git commit -m "feat: add FeatureCard component with video preview and icon fallback"
```

---

## Task 2: Create the PlusSection Component

**Files:**

- Create: `app/components/landing/PlusSection.tsx`

The new "Do more with Plus" section with purple background, 6 Plus feature cards, and CTAs.

- [ ] **Step 1: Create PlusSection component**

```tsx
// app/components/landing/PlusSection.tsx
'use client';

import { Cloud, Diamond, ScanSearch, Users, Layers, List } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { FeatureCard } from './FeatureCard';

const plusFeatures = [
  {
    icon: Cloud,
    title: 'Cloud sync',
    description:
      'Your collection and tracked sets on any device. Pick up right where you left off.',
    videoKey: 'cloud-sync',
  },
  {
    icon: Diamond,
    title: 'Part rarity insights',
    description:
      'See which pieces are rare or hard to find so you can prioritize your search.',
    videoKey: 'rarity',
  },
  {
    icon: ScanSearch,
    title: 'Unlimited identifications',
    description: 'Identify as many parts as you want — no daily limits.',
    videoKey: 'identify-unlimited',
  },
  {
    icon: Users,
    title: 'Unlimited Search Parties',
    description: 'Host as many group sorting sessions as you need.',
    videoKey: 'search-party-unlimited',
  },
  {
    icon: Layers,
    title: 'Unlimited tabs',
    description:
      'Open as many sets as you want and switch between them freely.',
    videoKey: 'tabs-unlimited',
  },
  {
    icon: List,
    title: 'Unlimited lists',
    description:
      'Create as many custom lists as you need to organize your collection.',
    videoKey: 'lists-unlimited',
  },
];

export function PlusSection() {
  return (
    <section className="relative overflow-hidden bg-brand-purple px-4 py-20 sm:px-6 sm:py-28">
      {/* Stud pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #fff 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="text-center">
          <span className="text-sm font-bold tracking-widest text-white/60 uppercase">
            Plus
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Do more with Plus
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/70">
            Cloud sync, rarity indicators, and unlimited usage.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {plusFeatures.map(feature => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              variant="plus"
            />
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Button href="/sets" variant="hero-primary" size="lg">
            Try it free
          </Button>
          <a
            href="#pricing"
            onClick={e => {
              const el = document.querySelector('#pricing');
              if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="text-sm font-medium text-white/80 underline underline-offset-2 transition-colors hover:text-white"
          >
            See pricing
          </a>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to PlusSection

- [ ] **Step 3: Commit**

```bash
git add app/components/landing/PlusSection.tsx
git commit -m "feat: add PlusSection component for Plus upsell on landing page"
```

---

## Task 3: Update LandingPage — Hero, How It Works, Features

**Files:**

- Modify: `app/components/landing/LandingPage.tsx`

Update the hero copy/CTAs, rewrite the How It Works steps, replace the features array with new cards using FeatureCard, remove the stats section, add the PlusSection, and update the bottom CTA.

- [ ] **Step 1: Update imports**

In `app/components/landing/LandingPage.tsx`, replace the imports block (lines 1-14):

```tsx
'use client';

import { Button } from '@/app/components/ui/Button';
import { Camera, Download, Filter, Package, Search, Users } from 'lucide-react';
import { FeatureCard } from './FeatureCard';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { PlusSection } from './PlusSection';
import { PricingSection } from './PricingSection';
```

- [ ] **Step 2: Update features and steps data arrays**

Replace the `features` array (lines 16-53) and `steps` array (lines 55-73) with:

```tsx
const features = [
  {
    icon: Search,
    title: 'Search any set',
    description:
      'Look up any LEGO set by number or name and instantly see its full parts inventory.',
    videoKey: 'search',
  },
  {
    icon: Filter,
    title: 'Filter & Sort',
    description:
      'Narrow down pieces by color, size, and category to find what you need fast.',
    videoKey: 'filter-sort',
  },
  {
    icon: Package,
    title: 'Track owned pieces',
    description:
      "Mark which pieces you've found. Your progress is saved locally — no account needed.",
    videoKey: 'inventory',
  },
  {
    icon: Camera,
    title: 'Identify parts by photo',
    description:
      'Snap a photo of a mystery piece and let AI identify the part number.',
    videoKey: 'identify',
  },
  {
    icon: Users,
    title: 'Search Party',
    description:
      'Invite friends or family to help sort through a pile together in real time.',
    videoKey: 'search-party',
  },
  {
    icon: Download,
    title: 'Export missing pieces',
    description:
      'Export your missing parts as a Rebrickable CSV or BrickLink wanted list.',
    videoKey: 'export',
  },
];

const steps = [
  {
    number: '1',
    title: 'Pick a set',
    description: 'Search by set number or name from our complete LEGO catalog.',
  },
  {
    number: '2',
    title: 'Find your pieces',
    description:
      'Filter and sort by color, size, and category to dig through your pile efficiently.',
  },
  {
    number: '3',
    title: 'Track your progress',
    description:
      'Mark pieces as you find them and watch your build come together.',
  },
];
```

- [ ] **Step 3: Update the Hero section**

Replace the hero section (lines 88-134 — from `{/* Hero */}` to the closing `</section>` including the angled divider) with:

```tsx
{
  /* Hero */
}
<section className="relative overflow-hidden bg-brand-yellow">
  {/* Stud pattern overlay */}
  <div
    className="pointer-events-none absolute inset-0 opacity-[0.07]"
    style={{
      backgroundImage: 'radial-gradient(circle, #000 1.5px, transparent 1.5px)',
      backgroundSize: '24px 24px',
    }}
  />

  <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-36">
    <h1 className="text-4xl font-extrabold tracking-tight text-on-yellow sm:text-5xl lg:text-6xl">
      Turn your pile of bricks back into sets
    </h1>
    <p className="mx-auto mt-5 max-w-2xl text-lg text-on-yellow/80 sm:text-xl">
      Pick a set, find the pieces, track your progress.
    </p>
    <div className="mt-8 flex flex-col items-center gap-4">
      <Button href="/sets" variant="hero-secondary" size="lg">
        Get started
      </Button>
      <p className="text-sm text-on-yellow/60">
        Free to use — no account required
      </p>
    </div>
  </div>

  {/* Angled divider */}
  <div className="absolute inset-x-0 -bottom-px">
    <svg
      viewBox="0 0 1440 48"
      fill="none"
      preserveAspectRatio="none"
      className="block h-8 w-full sm:h-12"
    >
      <path d="M0 48h1440V0L0 48Z" fill="white" />
    </svg>
  </div>
</section>;
```

- [ ] **Step 4: Update the How It Works section**

Replace the How It Works section (lines 172-200 — the `{/* How it works */}` section) with:

```tsx
{
  /* How it works */
}
<section
  id="how-it-works"
  className="bg-neutral-50 px-4 py-20 sm:px-6 sm:py-28"
>
  <div className="mx-auto max-w-4xl">
    <div className="text-center">
      <span className="text-sm font-bold tracking-widest text-brand-red uppercase">
        How it works
      </span>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
        From pile to built set in three steps
      </h2>
    </div>

    <div className="mt-14 grid gap-10 sm:grid-cols-3">
      {steps.map(step => (
        <div key={step.number} className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-red text-2xl font-extrabold text-white shadow-sm">
            {step.number}
          </div>
          <h3 className="mt-5 text-lg font-bold text-neutral-900">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            {step.description}
          </p>
        </div>
      ))}
    </div>
  </div>
</section>;
```

- [ ] **Step 5: Update Features section to use FeatureCard**

Replace the features section (lines 136-170 — the `{/* Features */}` section) with:

```tsx
{
  /* Features */
}
<section id="features" className="px-4 py-20 sm:px-6 sm:py-28">
  <div className="mx-auto max-w-6xl">
    <div className="text-center">
      <span className="text-sm font-bold tracking-widest text-brand-yellow uppercase">
        Features
      </span>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
        Everything you need for LEGO inventory
      </h2>
    </div>

    <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {features.map(feature => (
        <FeatureCard
          key={feature.title}
          icon={feature.icon}
          title={feature.title}
          description={feature.description}
        />
      ))}
    </div>
  </div>
</section>;
```

- [ ] **Step 6: Reorder sections, remove stats, add PlusSection, update bottom CTA**

Reorder the sections to match the spec: Hero → How It Works → Features → Plus → Pricing → Bottom CTA. The current page has Features before How It Works — swap them so How It Works comes first.

Remove the stats section (lines 202-220 — the `{/* Stats */}` section) entirely.

Add the PlusSection between the Features section and the Pricing section:

```tsx
{
  /* Plus upsell */
}
<PlusSection />;
```

Replace the bottom CTA section (lines 250-278 — the `{/* Bottom CTA */}` section) with:

```tsx
{
  /* Bottom CTA */
}
<section className="relative overflow-hidden bg-brand-blue px-4 py-20 sm:px-6 sm:py-28">
  {/* Stud pattern */}
  <div
    className="pointer-events-none absolute inset-0 opacity-[0.06]"
    style={{
      backgroundImage: 'radial-gradient(circle, #fff 1.5px, transparent 1.5px)',
      backgroundSize: '24px 24px',
    }}
  />

  <div className="relative mx-auto max-w-3xl text-center">
    <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
      Ready to find your favorite sets?
    </h2>
    <div className="mt-8">
      <Button href="/sets" variant="hero-primary" size="lg">
        Get started
      </Button>
    </div>
  </div>
</section>;
```

- [ ] **Step 7: Remove unused DollarSign import**

The `DollarSign` icon import is no longer used (BrickLink pricing card removed). Remove it from the imports — it was replaced by `Filter` in Step 1.

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Visually verify in browser**

Open `http://localhost:3000` (logged out / incognito) and verify:

- Hero shows new headline, subheadline, single CTA, and small text
- How It Works shows 3 updated steps
- Features shows 6 cards with icon fallback (no videos yet)
- Plus section shows purple background with 6 Plus cards
- Stats section is gone
- Bottom CTA shows "Ready to find your favorite sets?" with single button
- Pricing section still renders correctly

- [ ] **Step 10: Commit**

```bash
git add app/components/landing/LandingPage.tsx
git commit -m "feat: redesign landing page — new hero copy, updated features, Plus section, remove stats"
```

---

## Task 4: Update LandingNav

**Files:**

- Modify: `app/components/landing/LandingNav.tsx`

Fix the `#plus` anchor (which incorrectly pointed to How It Works) and add a "Plus" nav link.

- [ ] **Step 1: Update nav links array**

In `app/components/landing/LandingNav.tsx`, replace the nav links array (lines 31-34):

```tsx
          {[
            { label: 'Features', href: '#features' },
            { label: 'How it works', href: '#how-it-works' },
            { label: 'Plus', href: '#plus' },
            { label: 'Pricing', href: '#pricing' },
          ].map(link => (
```

Note: The PlusSection component uses `id` implicitly — we need to add `id="plus"` to the PlusSection. Update `app/components/landing/PlusSection.tsx` to add the id to the section element:

Change the section opening tag in PlusSection from:

```tsx
    <section className="relative overflow-hidden bg-brand-purple px-4 py-20 sm:px-6 sm:py-28">
```

to:

```tsx
    <section id="plus" className="relative overflow-hidden bg-brand-purple px-4 py-20 sm:px-6 sm:py-28">
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Visually verify in browser**

- Click "Features" nav link → scrolls to Features section
- Click "How it works" nav link → scrolls to How It Works section
- Click "Plus" nav link → scrolls to Plus section
- Click "Pricing" nav link → scrolls to Pricing section

- [ ] **Step 4: Commit**

```bash
git add app/components/landing/LandingNav.tsx app/components/landing/PlusSection.tsx
git commit -m "fix: update landing nav links — fix how-it-works anchor, add Plus link"
```

---

## Task 5: Update PricingSection — Add Mobile-Friendly and Dark Mode Rows

**Files:**

- Modify: `app/components/landing/PricingSection.tsx`

Add two new rows to the feature comparison table.

- [ ] **Step 1: Add new feature rows**

In `app/components/landing/PricingSection.tsx`, add two entries to the `features` array (after line 37, before the closing `];`):

```tsx
  { name: 'Mobile-friendly', free: 'Included', plus: 'Included' },
  { name: 'Dark mode', free: 'Included', plus: 'Included' },
```

- [ ] **Step 2: Update Free card CTA text**

In `app/components/landing/PricingSection.tsx`, in the `renderFreeCta` function (line 139-145), change the button text from "Sign up free" to "Get started":

```tsx
function renderFreeCta() {
  return (
    <Button href="/signup" variant="outline" className="w-full">
      Get started
    </Button>
  );
}
```

- [ ] **Step 3: Update Plus card CTA text**

In the `renderPlusCta` function, update the unauthenticated button text from "Get Brick Party Plus" to "Get Plus" (lines 157 and 163):

```tsx
{
  loading ? 'Redirecting...' : 'Get Plus';
}
```

Apply this change to both instances of "Get Brick Party Plus" in the function.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Visually verify in browser**

Scroll to pricing section and verify:

- "Mobile-friendly" row appears with checkmarks for both tiers
- "Dark mode" row appears with checkmarks for both tiers
- Free card CTA says "Get started"
- Plus card CTA says "Get Plus"

- [ ] **Step 6: Commit**

```bash
git add app/components/landing/PricingSection.tsx
git commit -m "feat: add mobile-friendly and dark mode rows to pricing table, update CTA text"
```

---

## Task 6: Final Polish and Verification

**Files:**

- Review: all modified landing page files

- [ ] **Step 1: Full page walkthrough**

Open `http://localhost:3000` in incognito (logged out). Scroll through entire page and verify:

1. **Hero:** Yellow background, "Turn your pile of bricks back into sets", subheadline, single "Get started" button, small "Free to use" text
2. **Features:** "Features" heading, 6 cards in 3-col grid with icon fallbacks
3. **How It Works:** 3 steps — Pick a set, Find your pieces, Track your progress
4. **Plus Section:** Purple background, "Do more with Plus", 6 Plus cards, "Try it free" + "See pricing"
5. **Pricing:** Table with mobile-friendly + dark mode rows, "Get started" / "Get Plus" CTAs
6. **Bottom CTA:** Blue background, "Ready to find your favorite sets?", single "Get started" button

- [ ] **Step 2: Test responsive layout**

Check at mobile (375px), tablet (768px), and desktop (1280px):

- Feature cards: 1 col → 2 col → 3 col
- How It Works: stacks vertically on mobile
- Plus section cards: same responsive behavior as free cards
- Nav links hidden on mobile
- Hero text readable at all sizes

- [ ] **Step 3: Test nav smooth scroll links**

Click each nav link (Features, How it works, Plus, Pricing) and verify smooth scrolling to correct section.

- [ ] **Step 4: Test all CTA button links**

- Hero "Get started" → `/sets`
- Plus section "Try it free" → `/sets`
- Plus section "See pricing" → scrolls to `#pricing`
- Pricing "Get started" → `/signup`
- Pricing "Get Plus" → triggers checkout or `/signup`
- Bottom CTA "Get started" → `/sets`

- [ ] **Step 5: Run linter and type check**

```bash
npx tsc --noEmit && npm run lint
```

Expected: No errors

- [ ] **Step 6: Commit any final fixes**

If any issues were found and fixed:

```bash
git add -A
git commit -m "fix: landing page polish — address layout and link issues"
```
