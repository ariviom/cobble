'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Camera,
  Download,
  DollarSign,
  Package,
  Search,
  Users,
} from 'lucide-react';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { PricingSection } from './PricingSection';

const features = [
  {
    icon: Search,
    title: 'Search any set',
    description:
      'Look up any LEGO set by number or name and instantly see its full parts inventory.',
  },
  {
    icon: Package,
    title: 'Track owned pieces',
    description:
      'Mark which pieces you already have. Your progress is saved locally — no account needed.',
  },
  {
    icon: Download,
    title: 'Export missing parts',
    description:
      'Export your missing parts list as Rebrickable CSV or BrickLink wanted list XML.',
  },
  {
    icon: DollarSign,
    title: 'BrickLink pricing',
    description:
      'See real-time BrickLink price guides so you know what missing pieces will cost.',
  },
  {
    icon: Camera,
    title: 'Identify parts',
    description:
      'Snap a photo of a loose piece and let AI identify the part number and matching sets.',
  },
  {
    icon: Users,
    title: 'Search Party',
    description:
      'Invite friends to help sort through a bulk lot together in real time.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Search a set',
    description: 'Enter any LEGO set number to load its full parts inventory.',
  },
  {
    number: '2',
    title: 'Mark what you own',
    description:
      'Tap through the inventory and mark the pieces you already have.',
  },
  {
    number: '3',
    title: 'Export the rest',
    description:
      'Download your missing pieces list, ready for Rebrickable or BrickLink.',
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
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <LandingNav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-yellow">
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
            Know exactly which pieces you need
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-on-yellow/80 sm:text-xl">
            Search any LEGO set, mark what you own, and export the missing parts
            list. Free. No account required.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button href="/sets" variant="hero-secondary" size="lg">
              Start building
            </Button>
            <Button
              href="/pricing"
              variant="ghost"
              size="lg"
              className="border-on-yellow/30 text-on-yellow hover:bg-on-yellow/10"
            >
              View pricing
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
            <path d="M0 48h1440V0L0 48Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* Features */}
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
              <div
                key={feature.title}
                className="group rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-yellow/15">
                  <feature.icon
                    className="size-6 text-brand-yellow"
                    strokeWidth={2.5}
                  />
                </div>
                <h3 className="text-lg font-bold text-neutral-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="plus" className="bg-neutral-50 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="text-sm font-bold tracking-widest text-brand-red uppercase">
              How it works
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
              Three steps to your missing parts list
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
      </section>

      {/* Stats */}
      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-4xl gap-10 text-center sm:grid-cols-3">
          {[
            { value: '20,000+', label: 'LEGO sets' },
            { value: '1M+', label: 'unique parts' },
            { value: '100%', label: 'free to use' },
          ].map(stat => (
            <div key={stat.label}>
              <p className="text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
                {stat.value}
              </p>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-neutral-50 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <span className="text-sm font-bold tracking-widest text-brand-yellow uppercase">
              Pricing
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
              Pick the plan that fits
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-neutral-600">
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
      <section className="relative overflow-hidden bg-brand-blue px-4 py-20 sm:px-6 sm:py-28">
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
            Ready to find your missing pieces?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
            Start tracking your LEGO inventory today. No sign-up required.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button href="/sets" variant="hero-primary" size="lg">
              Get started free
            </Button>
            <Button href="/login" variant="hero-secondary" size="lg">
              Sign in
            </Button>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
