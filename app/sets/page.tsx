import { UserSetsOverview } from '@/app/components/home/UserSetsOverview';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { fetchThemes } from '@/app/lib/services/themes';

export default async function SetsPage() {
  const themes = await fetchThemes().catch(() => []);

  return (
    <PageLayout>
      <UserSetsOverview initialThemes={themes} />
    </PageLayout>
  );
}
