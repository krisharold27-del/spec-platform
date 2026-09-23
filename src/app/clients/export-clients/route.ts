import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { loadClients } from '@/lib/clients-data';
import { searchClients, clientRows, CLIENTS_HEADER } from '@/lib/clients';
import { toCsv, csvName } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/** The client list as a CSV — the rows this viewer sees on /clients, search included. Nothing writes. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/signin', request.url));
  const q = new URL(request.url).searchParams.get('q')?.slice(0, 80) ?? '';
  const { clients } = await loadClients(user);
  return new NextResponse(toCsv(CLIENTS_HEADER, clientRows(searchClients(clients, q))), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvName('clients', new Date().toISOString())}"`,
      'cache-control': 'private, no-store',
    },
  });
}
