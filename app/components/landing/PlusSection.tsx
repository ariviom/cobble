'use client';

import { Button } from '@/app/components/ui/Button';
import { Cloud, Diamond, Layers, List, ScanSearch, Users } from 'lucide-react';
import { FeatureCard } from './FeatureCard';

const plusFeatures = [
  {
    icon: Cloud,
    title: 'Cloud sync',
    description:
      'Your collection and tracked sets on any device. Pick up right where you left off.',
    imageSrc: '/landing/plus/cloud-sync.webp',
  },
  {
    icon: Diamond,
    title: 'Part rarity insights',
    description:
      'See which pieces are rare, hard to find, or set exclusive so you can prioritize your search and identify sets.',
    imageSrc: '/landing/plus/rarity.webp',
  },
  {
    icon: ScanSearch,
    title: 'Unlimited identifications',
    description: 'Identify as many parts as you want - no daily limits.',
    imageSrc: '/landing/plus/identifications.webp',
  },
  {
    icon: Users,
    title: 'Unlimited Search Parties',
    description: 'Host as many group sorting sessions as you need.',
    imageSrc: '/landing/plus/search-parties.webp',
  },
  {
    icon: Layers,
    title: 'Unlimited tabs',
    description:
      'Open as many sets as you want and switch between them freely.',
    imageSrc: '/landing/plus/tabs.webp',
  },
  {
    icon: List,
    title: 'Unlimited lists',
    description:
      'Create as many custom lists as you need to organize your collection.',
    imageSrc: '/landing/plus/lists.webp',
  },
];

export function PlusSection() {
  return (
    <section
      id="plus"
      className="dark:bg-brand-purple-hero relative overflow-hidden bg-brand-purple px-4 py-20 sm:px-6 sm:py-28"
    >
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
              imageSrc={feature.imageSrc}
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
