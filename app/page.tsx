import { RecentlyViewedSets } from '@/app/components/home/RecentlyViewedSets';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { Button } from '@/app/components/ui/Button';
import { ThemedPageHeader } from '@/app/components/ui/ThemedPageHeader';
import { Camera, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <PageLayout>
      {/* Hero Section - Bold, LEGO-inspired design */}
      <section className="relative overflow-hidden">
        {/* Colored banner strip - like a LEGO box top */}
        <ThemedPageHeader preferredColor="purple" className="py-6 lg:py-10">
          <div className="container-default">
            <div className="flex flex-col items-center text-center">
              {/* Logo + Brand - LARGE and bold */}
              <div className="mb-4 flex items-center gap-4 lg:gap-6">
                <div className="relative h-20 w-20 drop-shadow-lg lg:h-28 lg:w-28">
                  <Image
                    src="/logo/brickparty_logo_sm.png"
                    alt="Brick Party"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl">
                  <span className="text-brand-yellow drop-shadow-sm">
                    Brick
                  </span>
                  <span className="text-white">Party</span>
                </h1>
              </div>

              {/* Tagline - Bold and visible */}
              <p className="mb-6 max-w-lg text-lg font-medium text-white/90 lg:text-xl">
                Track your LEGO set inventory, find missing pieces, and export
                lists for Rebrickable and BrickLink.
              </p>

              {/* CTA Buttons - Big, chunky, and playful (hardcoded colors to avoid theme conflicts) */}
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/search">
                  <Button
                    variant="hero-primary"
                    size="lg"
                    className="gap-2 text-lg"
                  >
                    <Search className="h-5 w-5" />
                    Search Sets
                  </Button>
                </Link>
                <Link href="/identify">
                  <Button
                    variant="hero-secondary"
                    size="lg"
                    className="gap-2 text-lg"
                  >
                    <Camera className="h-5 w-5" />
                    Identify Parts
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Decorative LEGO stud pattern - subtle dots in a row */}
          <div className="pointer-events-none absolute top-4 right-0 left-0 flex justify-center gap-8 opacity-10">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-4 w-4 rounded-full bg-white" />
            ))}
          </div>
        </ThemedPageHeader>

        {/* Yellow accent strip below purple banner */}
        <div className="h-2 bg-brand-yellow" />
      </section>

      {/* Recently Viewed Sets */}
      <RecentlyViewedSets />

      {/* Footer */}
      <footer className="mt-8 mb-8 border-t border-subtle px-4 pt-8">
        <div className="container-default flex flex-col items-center gap-4">
          <div className="flex gap-6 text-xs text-foreground-muted">
            <Link
              href="/terms"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </PageLayout>
  );
}
