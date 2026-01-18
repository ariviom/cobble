import { fetchThemes } from '@/app/lib/services/themes';
import ExclusivePiecesClient from './ExclusivePiecesClient';

export const metadata = {
  title: 'Set Exclusive Pieces | Brick Party',
  description:
    'Discover LEGO pieces that appear in only one set, filtered by theme.',
};

export default async function ExclusivePiecesPage() {
  const themes = await fetchThemes();

  // Sort themes alphabetically and filter to only root themes for simplicity
  const rootThemes = themes
    .filter(t => t.parent_id === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return <ExclusivePiecesClient themes={rootThemes} />;
}
