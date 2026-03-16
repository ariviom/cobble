import 'server-only';

import { searchPartsLocal } from '@/app/lib/catalog/parts';

export async function searchPartsPage(args: {
  query: string;
  page: number;
  pageSize: number;
}) {
  const { query, page, pageSize } = args;
  return searchPartsLocal(query, { page, pageSize });
}
