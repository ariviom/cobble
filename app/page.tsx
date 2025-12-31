import { RecentlyViewedSets } from '@/app/components/home/RecentlyViewedSets';
import { PageLayout } from '@/app/components/layout/PageLayout';
import Link from 'next/link';

export default function Home() {
  return (
    <PageLayout>
      <RecentlyViewedSets />

      <footer className="mt-12 mb-8 flex justify-center gap-6 text-xs text-foreground-muted">
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of Service
        </Link>
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </Link>
      </footer>
    </PageLayout>
  );
}
