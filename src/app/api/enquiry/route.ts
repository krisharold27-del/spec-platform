import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createThrottle } from '@/lib/throttle';
import { diagnose, deterministic } from '@/lib/diagnose';
import { PILLAR_META } from '@/lib/pillars';

/**
 * The front door's problem box: one free read for anybody who turns up.
 *
 * This is the moment the landing page is built around — a stranger types something that has been
 * bothering them for months and watches SPEC work out what is underneath it, before giving up an
 * email address. It is also a paid call available to anyone on the internet, so the allowance is
 * exactly one, and the second attempt asks them to sign up.
 *
 * Two limits, doing different jobs. The **cookie** is the real rule and the honest one: one enquiry,
 * and it survives a new tab. The **address** limit is the abuse floor underneath it, since a cookie
 * is trivially cleared — a handful an hour from one place, after which everyone from that address
 * gets the free reading rather than a paid one. Neither is presented as a punishment: nobody is ever
 * told to go away, they are told the next step.
 */

const ENQUIRY_COOKIE = 'spec_enquiry';

// Generous enough for an office behind one address, tight enough that a script is not worth writing.
const byAddress = createThrottle(60 * 60_000, 10_000, 12);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { problem?: string } | null;
  const problem = (body?.problem ?? '').trim().slice(0, 2000);
  if (problem.length < 8) {
    return NextResponse.json({ error: 'Tell us a bit more about what keeps happening.' }, { status: 400 });
  }

  const jar = await cookies();
  const usedItsGo = jar.get(ENQUIRY_COOKIE)?.value === 'used';
  const address =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // A second problem is not refused — it is read the simple way, with the sign-up as the next step.
  // Turning somebody away at the exact moment they are engaged would be the wrong trade.
  const spent = usedItsGo || !byAddress.allow(address);
  const diagnosis = spent ? deterministic(problem) : await diagnose(problem);

  const res = NextResponse.json({
    ...diagnosis,
    /** What the causal chain reads as, so the page does not need the pillar vocabulary. */
    letters: diagnosis.bloom.map(b => ({
      letter: PILLAR_META[b.pillar].letter,
      name: PILLAR_META[b.pillar].name,
      certainty: b.certainty,
    })),
    fix: diagnosis.chain.map(p => PILLAR_META[p].name),
    /** True once their free read is spent — the page asks for the business name from here. */
    spent,
  });

  if (!usedItsGo) {
    res.cookies.set(ENQUIRY_COOKIE, 'used', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
