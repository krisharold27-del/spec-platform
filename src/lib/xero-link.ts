import { randomUUID, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { seal, open, sameSecret, canHoldSecrets } from './secret-box';
import { refreshTokens, xeroApp, type XeroApp } from './xero-net';
import { needsRefresh, type XeroOrg, type XeroTokens } from './xero';
import { REFRESH_TOKEN_DAYS } from './xero';

/**
 * The Xero link, against the database.
 *
 * `lib/xero` decides, `lib/xero-net` fetches, and this holds the one genuinely dangerous thing in
 * the product: a refresh token, which is sixty days of read access to a business's accounts.
 *
 * ── The rule that makes rotation safe ────────────────────────────────────────────────────────────
 *
 * Xero rotates the refresh token on every use. The moment a refresh succeeds, the token that was
 * sent is dead and the new one is the only way back in. So the order is **store, then use** — and
 * never the other way round, however natural it reads:
 *
 *     const fresh = await refreshTokens(old)     // old is now dead
 *     await store(fresh.refreshToken)            // ← if this is skipped, the link is gone
 *     return fresh.accessToken
 *
 * Getting that backwards produces the worst class of fault this product can have: the customer's
 * connection works for the rest of the request and is permanently broken afterwards, with nothing
 * in any log to say why and no way to recover except sending them through consent again.
 *
 * ── What this does NOT do, said plainly ──────────────────────────────────────────────────────────
 *
 * Two refreshes at the same moment for the same connection will race: both send the same token,
 * Xero accepts one and kills the other, and whichever writes last may store a token Xero has
 * already retired. There is no lock here. The mitigation is that SPEC refreshes on demand rather
 * than on a timer, so the window is small — and `markBroken` means the customer is told the
 * connection needs remaking rather than being shown a number that quietly stopped moving. A proper
 * single-flight lock belongs here before this is under any real load, and it is not here yet.
 */

/** One vendor so far. The column exists so the second one does not need a migration. */
export const PROVIDER = 'xero';

/**
 * The cookie that carries the OAuth `state` across the round trip.
 *
 * A cookie rather than a table: it is one short-lived secret belonging to one browser, it expires
 * by itself, and a table of them is a table that needs sweeping. httpOnly so no script can read it,
 * sameSite lax so it survives the redirect back from Xero — `strict` would drop it on exactly the
 * navigation it exists for, which is a fault that only appears in production.
 */
export const STATE_COOKIE = 'spec_xero_state';
/** Long enough to sign in to Xero and think about it; short enough not to be lying around. */
export const STATE_MINUTES = 15;

export interface LinkState {
  /** Random, single use, checked on the way back. Without it the callback accepts anybody's code. */
  state: string;
  /** Which connection this consent is for, so the callback does not have to trust a query string. */
  connectionId: string;
}

export const newState = (connectionId: string): LinkState => ({
  state: randomBytes(32).toString('base64url'),
  connectionId,
});

export const packState = (link: LinkState): string => `${link.state}.${link.connectionId}`;

export function unpackState(raw: string | undefined | null): LinkState | null {
  const [state, ...rest] = String(raw ?? '').split('.');
  const connectionId = rest.join('.');
  if (!state || !connectionId) return null;
  return { state, connectionId };
}

/**
 * Does the state that came back match the one that went out?
 *
 * Compared without leaking how much of it matched — see `sameSecret`. A plain `===` on a secret
 * stops at the first differing byte, which is measurable, and this is the check that stops the
 * callback accepting an authorization code somebody else obtained.
 */
export function stateMatches(fromCookie: string | undefined | null, fromXero: string | undefined | null): boolean {
  const mine = unpackState(fromCookie);
  if (!mine || !fromXero) return false;
  return sameSecret(mine.state, String(fromXero));
}

export interface StoredCredential {
  id: string;
  connectionId: string;
  xeroOrgId: string | null;
  orgName: string | null;
  orgChoices: XeroOrg[];
  scope: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
}

const readChoices = (raw: string | null): XeroOrg[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as XeroOrg[]) : [];
  } catch {
    return [];
  }
};

/**
 * What SPEC holds for a connection — never including the credential itself.
 *
 * The sealed token is deliberately not on this shape. Every screen that wants to say "linked to
 * JBI Electrical Pty Ltd since Tuesday" can have this, and none of them can accidentally carry a
 * token into a page render, a log line or a serialised server-component payload.
 */
export async function credentialFor(tenantId: string, connectionId: string): Promise<StoredCredential | null> {
  const [row] = await db.select().from(schema.connectionCredentials)
    .where(and(
      eq(schema.connectionCredentials.tenantId, tenantId),
      eq(schema.connectionCredentials.connectionId, connectionId),
    ));
  if (!row) return null;
  return {
    id: row.id,
    connectionId: row.connectionId,
    xeroOrgId: row.xeroOrgId,
    orgName: row.orgName,
    orgChoices: readChoices(row.orgChoices),
    scope: row.scope,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

/** Sixty days from now, which is when the refresh token itself dies if nothing uses it. */
export const refreshExpiry = (now: Date = new Date()): string =>
  new Date(now.getTime() + REFRESH_TOKEN_DAYS * 86_400_000).toISOString();

/**
 * Write the credential down, sealed.
 *
 * One row per connection — `connection_credentials_connection` is unique — so relinking replaces
 * rather than accumulating. An old refresh token left behind after a relink is a live key to
 * somebody's books that nothing is watching.
 */
export async function storeCredential(opts: {
  tenantId: string;
  connectionId: string;
  tokens: XeroTokens;
  orgs: XeroOrg[];
  now?: Date;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const chosen = opts.orgs.length === 1 ? opts.orgs[0] : null;
  const values = {
    provider: PROVIDER,
    // One organisation and there is nothing to choose; more than one and SPEC must be told which.
    xeroOrgId: chosen?.xeroOrgId ?? null,
    orgName: chosen?.name ?? null,
    orgChoices: opts.orgs.length > 1 ? JSON.stringify(opts.orgs) : null,
    refreshTokenSealed: seal(opts.tokens.refreshToken),
    scope: opts.tokens.scope,
    expiresAt: refreshExpiry(now),
    updatedAt: now.toISOString(),
  };

  const existing = await credentialFor(opts.tenantId, opts.connectionId);
  if (existing) {
    await db.update(schema.connectionCredentials).set(values)
      .where(eq(schema.connectionCredentials.id, existing.id));
    return;
  }
  await db.insert(schema.connectionCredentials).values({
    id: randomUUID(),
    tenantId: opts.tenantId,
    connectionId: opts.connectionId,
    createdAt: now.toISOString(),
    ...values,
  });
}

/** Which set of books, once an administrator has said. Only ever one of the offered choices. */
export async function chooseOrg(opts: {
  tenantId: string; connectionId: string; xeroOrgId: string;
}): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const credential = await credentialFor(opts.tenantId, opts.connectionId);
  if (!credential) return { ok: false, reason: 'That connection is not linked to Xero.' };
  /*
    Only from the list Xero gave. Without this, the id comes off a form and SPEC would send the
    Xero-tenant-id header for any organisation somebody typed — which is how one customer reads
    another customer's accounts through a shared accountant's login.
  */
  const chosen = credential.orgChoices.find(o => o.xeroOrgId === opts.xeroOrgId);
  if (!chosen) return { ok: false, reason: 'That is not one of the organisations this Xero login reaches.' };

  await db.update(schema.connectionCredentials)
    .set({ xeroOrgId: chosen.xeroOrgId, orgName: chosen.name, updatedAt: new Date().toISOString() })
    .where(eq(schema.connectionCredentials.id, credential.id));
  return { ok: true, name: chosen.name };
}

/**
 * Forget the credential.
 *
 * Deleted, not blanked. A disconnected system whose row still holds a sealed refresh token is a key
 * to somebody's accounts sitting in a table nobody is looking at any more.
 */
export async function forgetCredential(tenantId: string, connectionId: string): Promise<void> {
  await db.delete(schema.connectionCredentials)
    .where(and(
      eq(schema.connectionCredentials.tenantId, tenantId),
      eq(schema.connectionCredentials.connectionId, connectionId),
    ));
}

export type AccessRead =
  | { ok: true; accessToken: string; xeroOrgId: string; orgName: string | null }
  | { ok: false; reason: string };

/**
 * An access token good for the next few minutes, and the organisation to spend it on.
 *
 * SPEC does not store access tokens: they last thirty minutes, keeping one buys a single fetch and
 * adds a second secret at rest. So every read refreshes, which is also what keeps the sixty-day
 * refresh token alive — a business that looks at its numbers once a month never lets the link die.
 *
 * `needsRefresh` is still used rather than ignored, because a caller may hand in an access token it
 * already has from earlier in the same request.
 */
export async function accessTokenFor(
  tenantId: string,
  connectionId: string,
  { app = xeroApp(), now = new Date(), cachedAccess = null as { token: string; expiresAt: string } | null } = {},
): Promise<AccessRead> {
  if (!canHoldSecrets()) {
    return { ok: false, reason: 'This deployment cannot hold credentials, so it cannot read from Xero.' };
  }
  if (!app) {
    return { ok: false, reason: 'Xero is not set up on this deployment yet.' };
  }

  const [row] = await db.select().from(schema.connectionCredentials)
    .where(and(
      eq(schema.connectionCredentials.tenantId, tenantId),
      eq(schema.connectionCredentials.connectionId, connectionId),
    ));
  if (!row) return { ok: false, reason: 'That system is not linked to Xero.' };
  if (!row.xeroOrgId) {
    return { ok: false, reason: 'Nobody has said which Xero organisation this business is, so SPEC is not reading anything.' };
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: 'The Xero connection has expired — Xero ends one after sixty days without use. It needs linking again.',
    };
  }

  if (cachedAccess && !needsRefresh(cachedAccess.expiresAt, now)) {
    return { ok: true, accessToken: cachedAccess.token, xeroOrgId: row.xeroOrgId, orgName: row.orgName };
  }

  let current: string;
  try {
    current = open(row.refreshTokenSealed);
  } catch {
    /*
      The seal did not open. Either TOKEN_ENCRYPTION_KEY has changed or the row was tampered with,
      and both are worth saying rather than reporting as "not connected" — they have completely
      different fixes and only one of them is the customer's to make.
    */
    return { ok: false, reason: 'SPEC cannot read the stored Xero credential for this business.' };
  }

  const refreshed = await refreshTokens(current, app as XeroApp, { now });
  if (!refreshed.ok) {
    await markBroken(tenantId, connectionId, now);
    return { ok: false, reason: refreshed.reason };
  }

  /*
    Stored BEFORE it is used. See the note at the top: the token just spent is already dead, so a
    failure between here and the return would take the connection with it.
  */
  await db.update(schema.connectionCredentials)
    .set({
      refreshTokenSealed: seal(refreshed.tokens.refreshToken),
      scope: refreshed.tokens.scope || row.scope,
      expiresAt: refreshExpiry(now),
      updatedAt: now.toISOString(),
    })
    .where(eq(schema.connectionCredentials.id, row.id));

  return {
    ok: true,
    accessToken: refreshed.tokens.accessToken,
    xeroOrgId: row.xeroOrgId,
    orgName: row.orgName,
  };
}

/**
 * Say the connection has stopped working — quietly.
 *
 * The product's own rule: a broken connection is never announced to the wider business. The KPI it
 * fed falls back to a manual confirmation, which is a complete way to run SPEC, and only the people
 * who look after connections are told.
 */
export async function markBroken(tenantId: string, connectionId: string, now: Date = new Date()): Promise<void> {
  await db.update(schema.systemConnections)
    .set({ status: 'broken', lastErrorAt: now.toISOString() })
    .where(and(
      eq(schema.systemConnections.tenantId, tenantId),
      eq(schema.systemConnections.id, connectionId),
      /*
        A business connection, never somebody's mailbox — the rule `tests/mail.test.ts` holds every
        read and write of this table to, and which caught this line.

        It cannot matter today, because the only credentials that exist are Xero's and a mailbox has
        none. It is here because the rule is "everywhere": the first personal credential to land
        would otherwise give this function the power to mark a person's own mailbox broken from a
        business code path, and nobody would think to look here for it.
      */
      isNull(schema.systemConnections.personalFor),
    ));
}
