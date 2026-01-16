import { PageLayout } from '@/app/components/layout/PageLayout';
import { MinifigPageClient } from '@/app/components/minifig/MinifigPageClient';
import { getMinifigMetaBl } from '@/app/lib/bricklink/minifigs';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type RouteParams = {
  figNum: string;
};

type MinifigPageProps = {
  params: Promise<RouteParams>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const blMinifigNo = resolved?.figNum?.trim();

  if (!blMinifigNo) {
    return {
      title: 'Minifig',
    };
  }

  // Get name from BrickLink catalog
  let name: string | null = null;
  try {
    const meta = await getMinifigMetaBl(blMinifigNo);
    if (meta?.name) {
      name = meta.name;
    }
  } catch {
    // Best-effort only
  }

  const baseTitle = name ?? blMinifigNo;

  return {
    title: `${baseTitle} – Minifig`,
  };
}

export default async function MinifigPage({ params }: MinifigPageProps) {
  const { figNum } = await params;

  if (!figNum) {
    notFound();
  }

  // figNum is now expected to be a BrickLink minifig ID
  return (
    <PageLayout>
      <MinifigPageClient figNum={figNum} />
    </PageLayout>
  );
}
