import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { isSensitive } from '@/lib/systems';
import { xeroApp, exchangeCode, listOrgs } from '@/lib/xero-net';
import { STATE_COOKIE, stateMatches, unpackState, storeCredential } from '@/lib/xero-link';
import { canHoldSecrets } from '@/lib/secret-box';
import { currentOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

/**
 * Coming back from Xero.
 *
 * A route handler rather than a server action, because Xero decides the shape of this request: it
 * is a GET with query parameters, arriving from another website. Everything SPEC controls about the
 * flow is in `startXero`; this end has to be written defensively, because what lands here is
 * whatever the browser was told to send.
 *
 * ── What is checked, and what each check is actually for ─────────────────────────────────────────
 *
 * **Signed in, and an administrator.** The session decides which business this is. Nothing about
 * which tenant is being connected comes from the query string, so a link cannot aim a consent at
 * somebody else's business.
 *
 * **The state cookie matches.** This is the check that stops the callback accepting an
 * authorization code somebody else obtained — compared without leaking how much of it matched. The
 * connection id rides in the cookie too, so a person cannot come back pointing at a different row
 * from the one they started.
 *
 * **The board decision, again.** It was checked before they were sent. It is checked again on the
 * way back because this is the request that produces a stored credential, and a guard that only
 * exists on the way out is a guard that is missing from the path that actually writes.
 *
 * ── Why every failure lands on /connections with a sentence ──────────────────────────────────────
 *
 * Kris's brief: *"if it spins, errors, or shows an unrecognised number, the anticipation inverts
 * into broken trust"*. A person who has just typed their accounting password into Xero and pressed
 * Allow is at the single most fragile moment in this product. They never see a stack trace, a JSON
 * body or a bare status code — they land back on the connections screen and read what happened.
 */
export async function GET(request: NextRequest) {
  const origin = await currentOrigin();
  const back = (reason: string) =>
    NextResponse.redirect(`${origin}/connections?cannot=${encodeURIComponent(reason)}`);

  const url = new URL(request.url);
  const cookie = request.cookies.get(STATE_COOKIE)?.value;

  // Whatever happens next, this state is spent. Cleared on every path, including the happy one.
  const done = (response: NextResponse) => {
    response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  };

  /*
    Xero's own refusal, first.

    `error=access_denied` is somebody pressing Cancel, which is not a fault and must not read like
    one — it is the single most likely outcome after "connected", and telling a customer something
    went wrong because they changed their mind is how a product feels broken when it is not.
  */
  const refused = url.searchParams.get('error');
  if (refused) {
    return done(back(
      refused === 'access_denied'
        ? 'Nothing was connected — the Xero sign-in was cancelled. You can start it again whenever you like.'
        : `Xero stopped the connection (${refused}). Nothing was changed.`,
    ));
  }

  const user = await getCurrentUser();
  if (!user) return done(NextResponse.redirect(`${origin}/signin`));
  const scope = await getScope(user);
  if (!scope.canAdminister) {
    return done(back('Only an administrator can connect a system to SPEC.'));
  }

  const code = url.searchParams.get('code');
  if (!code) return done(back('Xero did not send an authorisation back, so nothing was connected.'));

  if (!stateMatches(cookie, url.searchParams.get('state'))) {
    return done(back(
      'That Xero sign-in could not be matched to the one this browser started, so SPEC stopped. '
      + 'Start it again from this screen — it may simply have taken too long.',
    ));
  }
  const link = unpackState(cookie)!;

  const [connection] = await db.select().from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.id, link.connectionId),
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));
  if (!connection) return done(back('SPEC could not find the connection that sign-in was for.'));

  // Checked on the way out and again here, because this is the request that stores the key.
  if (isSensitive(connection.category)) {
    const decisions = await db.select().from(schema.approvals)
      .where(and(eq(schema.approvals.tenantId, user.tenantId), eq(schema.approvals.refId, connection.id)));
    if (!decisions.some(a => a.state === 'approved')) {
      return done(back('The board has not approved this connection, so SPEC did not keep the Xero sign-in.'));
    }
  }

  if (!canHoldSecrets()) {
    return done(back('This deployment cannot hold credentials, so the Xero sign-in was not kept.'));
  }
  const app = xeroApp();
  if (!app) return done(back('Xero is not set up on this deployment, so the sign-in was not kept.'));

  const exchanged = await exchangeCode(code, app);
  // parseTokens says WHY — including the offline_access mistake, which would otherwise produce a
  // connection that works this afternoon and is dead tomorrow.
  if (!exchanged.ok) return done(back(exchanged.reason));

  const orgs = await listOrgs(exchanged.tokens.accessToken);
  if (!orgs.ok) return done(back(orgs.reason));

  await storeCredential({
    tenantId: user.tenantId,
    connectionId: connection.id,
    tokens: exchanged.tokens,
    orgs: orgs.orgs,
  });

  /*
    Live only when there is nothing left to decide.

    One organisation and the link is complete. Several — a group, a trust, an accountant's login
    that reaches twenty clients — and SPEC has a credential but does not know whose books to read,
    so the connection stays where it was and the screen asks. Marking it live here would be SPEC
    claiming a number was on its way while it had no idea which set of accounts to get it from.
  */
  if (orgs.orgs.length === 1) {
    await db.update(schema.systemConnections)
      .set({ status: 'live', lastErrorAt: null })
      .where(eq(schema.systemConnections.id, connection.id));
    return done(NextResponse.redirect(
      `${origin}/connections?linked=${encodeURIComponent(orgs.orgs[0].name)}`,
    ));
  }

  return done(NextResponse.redirect(`${origin}/connections?choose=${connection.id}`));
}
