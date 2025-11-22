import { fetchThemes } from '@/app/lib/services/themes';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const themes = await fetchThemes();
    return NextResponse.json({ themes });
  } catch (err) {
    console.error('Themes fetch failed:', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'themes_failed' }, { status: 500 });
  }
}
