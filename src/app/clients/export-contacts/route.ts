import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { loadClients } from '@/lib/clients-data';
import { searchContacts, contactRows, CONTACTS_HEADER } from '@/lib/clients';
import { toCsv, csvName } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/** The contacts as a CSV — the rows this viewer sees on /clients?tab=contacts, search included. Nothing writes. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/signin', request.url));
  const q = new URL(request.url).searchParams.get('q')?.slice(0, 80) ?? '';
  const { contacts } = await loadClients(user);
  return new NextResponse(toCsv(CONTACTS_HEADER, contactRows(searchContacts(contacts, q))), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvName('contacts', new Date().toISOString())}"`,
      'cache-control': 'private, no-store',
    },
  });
}
