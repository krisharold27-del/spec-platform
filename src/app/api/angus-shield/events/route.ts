import { NextResponse, type NextRequest } from 'next/server';
import { receiveFromAngus } from '@/lib/angus-shield-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Angus Shield → SiteVIP events (docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md §3–4), signed, applied once. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 2_000_000) return NextResponse.json({ error: 'too_big', reason: 'That event is too big.', fix: 'Split it.' }, { status: 413 });
  const r = await receiveFromAngus(raw, req.headers.get('x-angus-signature'));
  return NextResponse.json(r.body, { status: r.status });
}

/** Which contract versions this side supports (§7). */
export function GET() {
  return NextResponse.json({ supports: ['1.0.0'], events_received: ['invoice.created', 'invoice.part_paid', 'invoice.paid', 'invoice.overdue', 'job.costs_updated', 'job.profit_updated'] });
}
