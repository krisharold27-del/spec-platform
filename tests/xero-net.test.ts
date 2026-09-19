import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  endpoints, xeroApp, redirectUri, exchangeCode, refreshTokens, listOrgs, profitAndLoss,
  REQUEST_TIMEOUT_MS,
} from '../src/lib/xero-net';
import { AUTHORIZE_URL, TOKEN_URL, CONNECTIONS_URL, REPORT_URL, authorizeUrl } from '../src/lib/xero';
import {
  newState, packState, unpackState, stateMatches, refreshExpiry, STATE_COOKIE, STATE_MINUTES,
} from '../src/lib/xero-link';

/**
 * ── The Xero link ────────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September: *"now do the xero oauth"*. His brief calls this the single biggest technical
 * risk in the product — *"the instant they link Xero, the board must populate FAST and CORRECTLY.
 * If it spins, errors, or shows an unrecognised number, the anticipation inverts into broken trust
 * — worse than never promising it."*
 *
 * `lib/xero` holds what a Profit and Loss MEANS and is tested next door. This file is about the
 * link itself: who may start it, what stops somebody else finishing it, what happens when Xero says
 * no, and the one that would be invisible until a customer lost their connection — rotation.
 *
 * None of it has run against Xero. This environment's proxy denies every Xero host, so what is
 * proven here and in `scripts/xero-journey.mts` is SPEC's two ends against Xero's published
 * contract. Saying more than that would be the exact failure `docs/MISTAKES.md` is about.
 */

const app = { clientId: 'id', clientSecret: 'shhh', redirectUri: 'https://spec.test/connections/xero/callback' };

/** A fetch that answers whatever this test wants, and records what it was asked. */
const answering = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

describe('where the requests go', () => {
  it('is Xero, by default and in production', () => {
    expect(endpoints({} as NodeJS.ProcessEnv).token).toBe(TOKEN_URL);
    expect(endpoints({} as NodeJS.ProcessEnv).authorize).toBe(AUTHORIZE_URL);
    expect(endpoints({} as NodeJS.ProcessEnv).connections).toBe(CONNECTIONS_URL);
    expect(endpoints({} as NodeJS.ProcessEnv).report).toBe(REPORT_URL);
  });

  it('can be pointed at the offline server, so the flow can be walked without a network', () => {
    const env = { XERO_FAKE_BASE: 'http://localhost:5055' } as unknown as NodeJS.ProcessEnv;
    expect(endpoints(env).token).toBe('http://localhost:5055/connect/token');
    expect(endpoints(env).report).toBe('http://localhost:5055/api.xro/2.0/Reports/ProfitAndLoss');
    expect(endpoints({ XERO_FAKE_BASE: 'http://127.0.0.1:5055' } as unknown as NodeJS.ProcessEnv).token)
      .toBe('http://127.0.0.1:5055/connect/token');
  });

  /*
    The check that makes the offline server safe to have at all.

    A variable that redirects a token exchange looks like a way to send a customer's credentials
    somewhere else, so it is not a matter of trusting the environment: a non-loopback address is
    ignored EVERYWHERE. There is no value of this variable, on any host, that points a token
    exchange at somebody on the internet.
  */
  it('BUT ONLY EVER AT THIS MACHINE — a real address is ignored outright', () => {
    for (const base of [
      'https://somewhere-else.example',
      'http://169.254.169.254',              // the cloud metadata address, which is the classic one
      'http://localhost.evil.example',       // ends up nowhere near localhost
      'http://127.0.0.1.evil.example',
    ]) {
      const env = { XERO_FAKE_BASE: base } as unknown as NodeJS.ProcessEnv;
      expect(endpoints(env).token, `${base} was honoured`).toBe(TOKEN_URL);
    }
  });

  /*
    And belt and braces on the real deployment. `VERCEL_ENV` is set by the platform and is not
    something a mistake in a settings box can produce.

    This used to be a NODE_ENV check, which was both less safe and wrong: `next start` sets NODE_ENV
    to production by design, so every journey in CI runs in "production" — and the safety check was
    switching off the only thing built to prove the connector works.
  */
  it('AND A REAL DEPLOYMENT IGNORES IT WHATEVER IT SAYS', () => {
    const env = { XERO_FAKE_BASE: 'http://localhost:5055', VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv;
    expect(endpoints(env).token).toBe(TOKEN_URL);
    expect(endpoints(env).authorize).toBe(AUTHORIZE_URL);
  });

  /*
    Xero checks `redirect_uri` against the exact list registered on the app, so this one is FIXED —
    the opposite of what lib/origin does for Stripe, and deliberately. A per-origin address would
    be refused by Xero outright rather than merely landing somebody on the wrong site.
  */
  it('and the address Xero returns to is the one configured address, never the request’s', () => {
    expect(redirectUri('https://app.specbizhq.com')).toBe('https://app.specbizhq.com/connections/xero/callback');
    expect(redirectUri('https://app.specbizhq.com/')).toBe('https://app.specbizhq.com/connections/xero/callback');
    const page = readFileSync('src/lib/xero-net.ts', 'utf8');
    expect(page).not.toContain('currentOrigin');
  });

  it('and an unconfigured deployment answers null rather than throwing at a customer', () => {
    expect(xeroApp({} as NodeJS.ProcessEnv)).toBeNull();
    expect(xeroApp({ XERO_CLIENT_ID: 'id' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(xeroApp({ XERO_CLIENT_ID: 'id', XERO_CLIENT_SECRET: 's', APP_URL: 'https://x.test' } as unknown as NodeJS.ProcessEnv))
      .toEqual({ clientId: 'id', clientSecret: 's', redirectUri: 'https://x.test/connections/xero/callback' });
  });
});

describe('asking Xero for tokens', () => {
  it('SENDS THE CLIENT SECRET AS A HEADER AND NEVER IN THE BODY', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await exchangeCode('the-code', app, {
      fetchImpl: answering(200, { access_token: 'a', refresh_token: 'r', expires_in: 1800 }, seen),
      env: {} as NodeJS.ProcessEnv,
    });
    expect(String((seen.init?.headers as Record<string, string>).authorization)).toMatch(/^Basic /);
    expect(String(seen.init?.body)).not.toContain('shhh');
    expect(String(seen.init?.body)).toContain('grant_type=authorization_code');
  });

  it('and gives back Xero’s own reason when Xero refuses, not a status code', async () => {
    const refused = await exchangeCode('bad', app, {
      fetchImpl: answering(400, { error: 'invalid_grant', error_description: 'The authorisation was withdrawn.' }),
      env: {} as NodeJS.ProcessEnv,
    });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain('The authorisation was withdrawn');
  });

  /*
    The mistake that cannot be fixed later without sending the customer through consent again: no
    `offline_access`, so no refresh token, so the connection dies thirty minutes after it is made.
    It has to be refused at the exchange — storing what came back would produce a link that works
    this afternoon and is dead tomorrow, which looks exactly like success.
  */
  it('AND REFUSES A TOKEN RESPONSE WITH NO REFRESH TOKEN IN IT', async () => {
    const thin = await exchangeCode('c', app, {
      fetchImpl: answering(200, { access_token: 'a', expires_in: 1800 }),
      env: {} as NodeJS.ProcessEnv,
    });
    expect(thin.ok).toBe(false);
    expect(thin.ok === false && thin.reason).toContain('offline_access');
  });

  it('and says so plainly when Xero cannot be reached at all', async () => {
    const dead = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const out = await refreshTokens('r', app, { fetchImpl: dead, env: {} as NodeJS.ProcessEnv });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('could not reach Xero');
  });

  /*
    "If it spins" is on Kris's list of the three ways this loses trust. A fetch with no deadline
    spins forever, on a page somebody is watching populate.
  */
  it('AND EVERY CALL CARRIES A DEADLINE', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await listOrgs('a', { fetchImpl: answering(200, [], seen), env: {} as NodeJS.ProcessEnv });
    expect(seen.init?.signal).toBeDefined();
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it('and an HTML error page from something in front of Xero is not reported as a fault', async () => {
    const out = await listOrgs('a', {
      fetchImpl: answering(502, '<html><body>Bad gateway</body></html>'),
      env: {} as NodeJS.ProcessEnv,
    });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('502');
    // The page body itself is never printed at somebody: it is alarming noise and says nothing.
    expect(out.ok === false && out.reason).not.toContain('Bad gateway');
  });
});

describe('which organisation, and reading the report', () => {
  it('drops anything that is not an organisation with a Profit and Loss', async () => {
    const out = await listOrgs('a', {
      fetchImpl: answering(200, [
        { tenantId: 'o1', tenantName: 'JBI Electrical', tenantType: 'ORGANISATION' },
        { tenantId: 'p1', tenantName: 'An accounting practice', tenantType: 'PRACTICE' },
      ]),
      env: {} as NodeJS.ProcessEnv,
    });
    expect(out.ok && out.orgs).toEqual([{ xeroOrgId: 'o1', name: 'JBI Electrical' }]);
  });

  it('and says so when a login reaches nothing SPEC can read', async () => {
    const out = await listOrgs('a', { fetchImpl: answering(200, []), env: {} as NodeJS.ProcessEnv });
    expect(out.ok).toBe(false);
  });

  it('SENDS THE ORGANISATION AS THE XERO-TENANT-ID HEADER', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await profitAndLoss(
      { accessToken: 'a', xeroOrgId: 'org-jbi', toDate: '2026-09-30', months: 3 },
      { fetchImpl: answering(200, { Reports: [] }, seen), env: {} as NodeJS.ProcessEnv },
    );
    expect((seen.init?.headers as Record<string, string>)['xero-tenant-id']).toBe('org-jbi');
    expect(seen.url).toContain('periods=2');
    expect(seen.url).toContain('timeframe=MONTH');
  });

  it('and a removed connection reads as that, not as a fault', async () => {
    const out = await profitAndLoss(
      { accessToken: 'a', xeroOrgId: 'o', toDate: '2026-09-30', months: 3 },
      { fetchImpl: answering(401, { Title: 'Unauthorized' }), env: {} as NodeJS.ProcessEnv },
    );
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('removed in Xero');
  });
});

describe('the state that stops somebody else finishing the sign-in', () => {
  it('IS RANDOM, AND CARRIES WHICH CONNECTION IT WAS FOR', () => {
    const a = newState('conn-1');
    const b = newState('conn-1');
    expect(a.state).not.toBe(b.state);
    expect(a.state.length).toBeGreaterThan(30);
    expect(unpackState(packState(a))).toEqual(a);
  });

  /*
    The connection id rides in the COOKIE rather than in the query string, so somebody cannot come
    back from Xero pointing at a different row from the one they started — which would be a way to
    attach one business's credential to another's connection.
  */
  it('and a connection id with dots in it survives the round trip', () => {
    const link = { state: 'abc', connectionId: 'a.b.c' };
    expect(unpackState(packState(link))).toEqual(link);
  });

  it('MATCHES ONLY THE STATE THAT WENT OUT', () => {
    const link = newState('conn-1');
    const cookie = packState(link);
    expect(stateMatches(cookie, link.state)).toBe(true);
    expect(stateMatches(cookie, 'something-else')).toBe(false);
    expect(stateMatches(cookie, null)).toBe(false);
    expect(stateMatches(undefined, link.state)).toBe(false);
    expect(stateMatches('', '')).toBe(false);
  });

  it('and it is compared without leaking how much of it matched', () => {
    const source = readFileSync('src/lib/xero-link.ts', 'utf8');
    expect(source).toContain('sameSecret(');
  });

  it('and the cookie cannot be read by a script, and does not live long', () => {
    const actions = readFileSync('src/app/connections/actions.ts', 'utf8');
    const body = actions.slice(actions.indexOf('export async function startXero'));
    expect(body).toContain('httpOnly: true');
    // `strict` would drop the cookie on exactly the navigation it exists for — a fault that only
    // shows up in production, on the one journey nobody can afford to have fail.
    expect(body).toContain("sameSite: 'lax'");
    expect(STATE_COOKIE).toBe('spec_xero_state');
    expect(STATE_MINUTES).toBeLessThanOrEqual(30);
  });
});

describe('the guards on the flow', () => {
  const actions = readFileSync('src/app/connections/actions.ts', 'utf8');
  const callback = readFileSync('src/app/connections/xero/callback/route.ts', 'utf8');

  it('ONLY AN ADMINISTRATOR CAN START IT', () => {
    const body = actions.slice(actions.indexOf('export async function startXero'));
    expect(body.slice(0, 200)).toContain('administrator()');
  });

  /*
    The board decision moved forward. It used to be checked at `markLive`, which was right while
    nothing was ever stored — but the moment a customer completes consent SPEC is HOLDING a key to
    their accounts, whatever any row says afterwards. So it is checked before they are sent.
  */
  it('AND THE BOARD DECIDES BEFORE ANYBODY IS SENT TO XERO', () => {
    const body = actions.slice(actions.indexOf('export async function startXero'));
    expect(body).toContain('isSensitive(connection.category)');
    expect(body).toContain("a.state === 'approved'");
    expect(body.indexOf('approved')).toBeLessThan(body.indexOf('authorizeUrl'));
  });

  /*
    And checked AGAIN on the way back. A guard that only exists on the path out is a guard missing
    from the path that actually writes the credential.
  */
  it('AND AGAIN ON THE WAY BACK, WHICH IS THE REQUEST THAT STORES THE KEY', () => {
    expect(callback).toContain('isSensitive(connection.category)');
    expect(callback).toContain("a.state === 'approved'");
    expect(callback).toContain('canAdminister');
  });

  it('and refuses to ask Xero for a credential it could not store safely', () => {
    const body = actions.slice(actions.indexOf('export async function startXero'));
    expect(body).toContain('canHoldSecrets()');
    expect(body.indexOf('canHoldSecrets()')).toBeLessThan(body.indexOf('authorizeUrl'));
    expect(callback).toContain('canHoldSecrets()');
  });

  /*
    Somebody pressing Cancel is the most likely outcome after "connected", and it is not a fault.
    Telling a customer something went wrong because they changed their mind is how a product feels
    broken when it is working.
  */
  it('AND A CANCELLED SIGN-IN DOES NOT READ AS A FAULT', () => {
    expect(callback).toContain('access_denied');
    expect(callback).toContain('Nothing was connected');
  });

  it('and disconnecting takes the credential with it', () => {
    const body = actions.slice(actions.indexOf('export async function disconnectSystem'));
    expect(body.slice(0, 1400)).toContain('forgetCredential');
    const link = readFileSync('src/lib/xero-link.ts', 'utf8');
    // Deleted, not blanked: a sealed token on a connection the business believes is off is a live
    // key to their accounts in a table nobody is watching.
    expect(link.slice(link.indexOf('export async function forgetCredential'))).toContain('db.delete');
  });
});

describe('rotation, which is the one that would be invisible', () => {
  const link = readFileSync('src/lib/xero-link.ts', 'utf8');
  const body = link.slice(link.indexOf('export async function accessTokenFor'));

  /*
    Xero retires a refresh token the moment it is spent. Storing the new one AFTER using the access
    token — or not at all — produces a connection that works for the rest of the request and is
    permanently dead afterwards, with nothing in any log to say why.

    Held against the ORDER of the code, because that is what the fault actually is.
  */
  it('STORES THE NEW REFRESH TOKEN BEFORE IT USES THE ACCESS TOKEN', () => {
    const stored = body.indexOf('refreshTokenSealed: seal(refreshed.tokens.refreshToken)');
    const returned = body.indexOf('accessToken: refreshed.tokens.accessToken');
    expect(stored).toBeGreaterThan(-1);
    expect(returned).toBeGreaterThan(-1);
    expect(stored).toBeLessThan(returned);
  });

  it('and seals it rather than writing it down', () => {
    expect(body).not.toMatch(/refreshTokenSealed:\s*refreshed\.tokens\.refreshToken/);
    expect(link).toContain("from './secret-box'");
  });

  it('and a failed refresh marks the connection broken rather than going quiet', () => {
    expect(body).toContain('markBroken(');
  });

  /*
    A mirror, a scorecard and the board pack all read connections. None of them should be able to
    carry a credential into a render — so the shape those screens get does not have one on it.
  */
  it('AND NOTHING THAT A PAGE READS CARRIES THE CREDENTIAL', () => {
    const shape = link.slice(link.indexOf('export interface StoredCredential'), link.indexOf('const readChoices'));
    expect(shape).not.toMatch(/refreshToken|Sealed/);
  });

  it('and the sixty days Xero gives are counted from the last use, not from the link', () => {
    const now = new Date('2026-09-19T00:00:00.000Z');
    expect(refreshExpiry(now).slice(0, 10)).toBe('2026-11-18');
  });
});

describe('one set of books, chosen and never guessed', () => {
  const link = readFileSync('src/lib/xero-link.ts', 'utf8');

  /*
    A Xero login often reaches several organisations — a group, a trust, an accountant's practice
    with twenty clients on it. Taking the first would put somebody else's accounts on a scorecard.
  */
  it('IS ONLY EVER ONE XERO GAVE, NOT ONE THAT CAME OFF A FORM', () => {
    const body = link.slice(link.indexOf('export async function chooseOrg'));
    expect(body).toContain('credential.orgChoices.find');
    expect(body).toContain('not one of the organisations');
  });

  it('and a connection with nothing chosen reads nothing at all', () => {
    const body = link.slice(link.indexOf('export async function accessTokenFor'));
    expect(body).toContain('!row.xeroOrgId');
    expect(body).toContain('Nobody has said which Xero organisation');
  });

  it('and the callback does not call it live while that is still open', () => {
    const callback = readFileSync('src/app/connections/xero/callback/route.ts', 'utf8');
    expect(callback).toContain('orgs.orgs.length === 1');
    const marksLive = callback.indexOf("status: 'live'");
    const oneOrg = callback.indexOf('orgs.orgs.length === 1');
    expect(oneOrg).toBeLessThan(marksLive);
  });
});

describe('the authorize URL', () => {
  it('asks for offline_access and reports, and nothing wider', () => {
    const url = authorizeUrl({ clientId: 'id', redirectUri: 'https://x.test/cb', state: 's' });
    expect(url.startsWith(AUTHORIZE_URL)).toBe(true);
    const scope = new URL(url).searchParams.get('scope') ?? '';
    expect(scope).toContain('offline_access');
    expect(scope).toContain('accounting.reports.read');
    // Reports only. A connector that asks for the ledger is one an accountant is right to refuse.
    expect(scope).not.toContain('accounting.transactions');
    expect(scope).not.toContain('.write');
  });

  it('and can be pointed at the offline server without changing anything else', () => {
    const url = authorizeUrl({
      clientId: 'id', redirectUri: 'https://x.test/cb', state: 's',
      authorize: 'http://localhost:5055/identity/connect/authorize',
    });
    expect(url.startsWith('http://localhost:5055/')).toBe(true);
    expect(new URL(url).searchParams.get('state')).toBe('s');
  });
});
