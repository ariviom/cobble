'use client';

import { Button } from '@/app/components/ui/Button';
import { Camera, Download, Filter, Package, Search, Users } from 'lucide-react';
import { FeatureCard } from './FeatureCard';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { PlusSection } from './PlusSection';
import { PricingSection } from './PricingSection';

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
    image: '/landing/pick.webp',
    padImage: true,
  },
  {
    number: '2',
    title: 'Find your pieces',
    description:
      'Filter and sort by color, size, and category to dig through your pile efficiently.',
    image: '/landing/find.webp',
    coverImage: true,
  },
  {
    number: '3',
    title: 'Track your progress',
    description:
      'Mark pieces as you find them and watch your build come together.',
    image: '/landing/track.webp',
  },
];

type LandingPageProps = {
  plusMonthlyPriceId: string;
  plusYearlyPriceId: string;
};

export function LandingPage({
  plusMonthlyPriceId,
  plusYearlyPriceId,
}: LandingPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <LandingNav />

      {/* Hero */}
      <section className="dark:bg-brand-yellow-hero relative overflow-hidden bg-brand-yellow">
        {/* Stud pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #000 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-36">
          <h1 className="text-4xl font-extrabold tracking-tight text-on-yellow sm:text-5xl lg:text-6xl">
            Turn your pile of bricks
            <br />
            back into sets
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-on-yellow/80 sm:text-xl">
            Pick a set, find the pieces, track your progress.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button href="/sets" variant="hero-secondary" size="lg">
              Get started
            </Button>
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
            <path
              d="M0 48h1440V0L0 48Z"
              className="fill-neutral-50 dark:fill-background-muted"
            />
          </svg>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="bg-neutral-50 px-4 py-20 sm:px-6 sm:py-28 dark:bg-background-muted"
      >
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="text-sm font-bold tracking-widest text-brand-red uppercase">
              How it works
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              From pile to built set in three steps
            </h2>
          </div>

          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {steps.map(step => (
              <div key={step.number} className="text-center">
                <div
                  className={`mx-auto mb-5 flex aspect-square items-center justify-center overflow-hidden rounded border border-subtle bg-white shadow-sm ${
                    step.padImage ? 'p-4' : ''
                  }`}
                >
                  <img
                    src={step.image}
                    alt={step.title}
                    className={
                      step.coverImage
                        ? 'h-full w-full object-cover'
                        : 'max-h-full max-w-full object-contain'
                    }
                    loading="lazy"
                  />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="text-sm font-bold tracking-widest text-brand-blue uppercase dark:text-link">
              Features
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
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
      </section>

      {/* Plus upsell */}
      <PlusSection />

      {/* Pricing */}
      <section className="bg-neutral-50 px-4 py-20 sm:px-6 sm:py-28 dark:bg-background-muted">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <span className="text-sm font-bold tracking-widest text-brand-green uppercase">
              Pricing
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Pick the plan that fits
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-foreground-muted">
              Everything you need to track LEGO sets is free. Upgrade to Plus
              for unlimited power.
            </p>
          </div>
          {/* Safe to hardcode: LandingPage only renders for unauthenticated visitors
              (app/page.tsx redirects authenticated users to /sets) */}
          <PricingSection
            isAuthenticated={false}
            tier="free"
            subscriptionStatus={null}
            hadPriorSubscription={false}
            plusMonthlyPriceId={plusMonthlyPriceId}
            plusYearlyPriceId={plusYearlyPriceId}
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="dark:bg-brand-blue-hero relative overflow-hidden bg-brand-blue px-4 py-20 sm:px-6 sm:py-28">
        {/* Stud pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #fff 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ready to find your favorite sets?
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button href="/sets" variant="hero-primary" size="lg">
              Get started
            </Button>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
