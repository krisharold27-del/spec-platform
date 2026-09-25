import { NextResponse } from 'next/server';
import { getCurrentUser, canManage } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { toCsv, csvName } from '@/lib/csv';
import { weekFor, sendWeek } from '@/lib/timesheets-data';
import { PAY_HEADER, payLines } from '@/lib/timesheets';

export const dynamic = 'force-dynamic';

/**
 * The approved timesheet, as a file any payroll system imports — the business's own-system path,
 * and it is one tap. Hours only: person, date, job, site, start, finish, break, travel, paid hours,
 * allowances. No rate, no tax, no super — SiteVIP never works those out.
 *
 *   POST  sends the week (records it as sent, with the summary it went with) and returns the file.
 *   GET   returns the file again for a week already approved — export always works, lapsed or not.
 *
 * A plain form posts here rather than a server action, because a server action cannot hand the
 * browser a download; the POST is refused unless it comes from this same site.
 */
async function file(request: Request, send: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/signin', request.url));
  if (!canManage(user.access)) return new NextResponse('Approving and sending timesheets is for a leader.', { status: 403 });
  const url = new URL(request.url);
  const week = (send ? String((await request.formData()).get('week') ?? '') : url.searchParams.get('week') ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return new NextResponse('Which week?', { status: 400 });

  if (send) {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return new NextResponse('Refused.', { status: 403 });
    // Sending is a write: a look-around or a lapsed business is told so. The GET download still works.
    await assertWritable(user.tenantId);
    const sent = await sendWeek(user, week);
    // Connected to Angus Shield (the contract's one yes): hours go on approval. No file, no export step.
    if (sent.ok && sent.to === 'angus_shield') {
      return NextResponse.redirect(new URL(`/jobs?tab=time&week=${week}`, request.url), 303);
    }
    if (!sent.ok && !sent.why.startsWith('Sent ')) {
      return NextResponse.redirect(new URL(`/jobs?tab=time&week=${week}&cannot=${encodeURIComponent(sent.why)}`, request.url), 303);
    }
  }

  const { monday, entries, jobs } = await weekFor(user.tenantId, week);
  const body = toCsv([...PAY_HEADER], payLines(entries, jobs));
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvName(`timesheets-week-of-${monday}`, new Date().toISOString())}"`,
      'cache-control': 'private, no-store',
    },
  });
}

export const GET = (request: Request) => file(request, false);
export const POST = (request: Request) => file(request, true);
