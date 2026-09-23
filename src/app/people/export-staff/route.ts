import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { loadDirectory } from '@/lib/directory-data';
import { searchDirectory, directoryRows, DIRECTORY_HEADER } from '@/lib/directory';
import { toCsv, csvName } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/**
 * The staff list as a CSV — the same rows the screen shows this viewer, search included. Clear to
 * Work and licences are blank for anybody outside the viewer's own line, exactly as on screen.
 * Export always works, lapsed or not: nothing here writes.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/signin', request.url));
  const q = new URL(request.url).searchParams.get('q')?.slice(0, 80) ?? '';
  const { people } = await loadDirectory(user);
  const body = toCsv(DIRECTORY_HEADER, directoryRows(searchDirectory(people, q)));
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvName('staff', new Date().toISOString())}"`,
      'cache-control': 'private, no-store',
    },
  });
}
