import { MinifigPageClient } from '@/app/components/minifig/MinifigPageClient';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { notFound } from 'next/navigation';

type RouteParams = {
  figNum: string;
};

type MinifigPageProps = {
  params: Promise<RouteParams>;
};

export default async function MinifigPage({ params }: MinifigPageProps) {
  const { figNum } = await params;

  if (!figNum) {
    notFound();
  }

  return (
    <PageLayout>
      <MinifigPageClient figNum={figNum} />
    </PageLayout>
  );
}



