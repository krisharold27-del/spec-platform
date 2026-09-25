import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { open } from '@/lib/secret-box';
import { sameSecret } from '@/lib/secret-box';
import { ANGUS_STATE_COOKIE } from '@/lib/angus-shield-link';
import { completeAngus } from '@/lib/angus-shield-data';

export const dynamic = 'force-dynamic';

/** Back from Angus Shield's yes: check it's the same person and request, trade the code, store it sealed. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/connections?${q}`, request.url));
  const jar = await cookies();
  const raw = jar.get(ANGUS_STATE_COOKIE)?.value;
  jar.delete(ANGUS_STATE_COOKIE);
  if (url.searchParams.get('error') === 'access_denied') return back('angus=declined');
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/signin', request.url));
  if (!(await getScope(user)).canAdminister) return back(`cannot=${encodeURIComponent('Only an administrator can connect Angus Shield.')}`);
  let saved: { state: string; verifier: string; connectionId: string; tenantId: string; until: number } | null = null;
  try { saved = raw ? JSON.parse(open(raw)) : null; } catch { saved = null; }
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  if (!saved || saved.until < Date.now() || saved.tenantId !== user.tenantId || !sameSecret(saved.state, state) || !code) return back(`cannot=${encodeURIComponent('That sign-in took too long or came from somewhere else. Press Connect Angus Shield again.')}`);
  const r = await completeAngus({ tenantId: user.tenantId, connectionId: saved.connectionId, code, verifier: saved.verifier });
  return r.ok ? back('angus=connected') : back(`cannot=${encodeURIComponent(r.reason)}`);
}
