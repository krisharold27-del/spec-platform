import {
  AUTHORIZE_URL, TOKEN_URL, CONNECTIONS_URL, REPORT_URL,
  basicAuth, tokenRequestBody, refreshRequestBody, parseTokens, parseConnections,
  grossProfit, reportQuery,
  type TokenParse, type XeroOrg, type ReportRead,
} from './xero';
import { appUrl } from './origin';

/**
 * Xero, the half with the network in it.
 *
 * `lib/xero` decides everything that can be decided without a connection — what URL to send
 * somebody to, what to post back, what a Profit and Loss report means. This file is the thin layer
 * that actually goes out and gets it, and it is deliberately thin: every judgement worth testing
 * lives next door, where it can be tested without a socket.
 *
 * ── What is proven and what is not ───────────────────────────────────────────────────────────────
 *
 * This environment's egress proxy denies `api.xero.com`, `identity.xero.com` and `login.xero.com`.
 * So none of this has run against Xero, and saying otherwise would be the exact failure
 * `docs/MISTAKES.md` is about. What HAS been run, end to end, is the whole flow against
 * `scripts/fake-xero.mjs` — a server that answers Xero's published contract, including the shapes
 * that go wrong. That proves the wiring and the refusals. It does not prove Xero agrees, and the
 * first real call has to happen somewhere the network is allowed.
 *
 * ── Why nothing here throws on a bad answer ──────────────────────────────────────────────────────
 *
 * Kris's brief calls this the single biggest technical risk in the product: *"the instant they link
 * Xero, the board must populate FAST and CORRECTLY. If it spins, errors, or shows an unrecognised
 * number, the anticipation inverts into broken trust — worse than never promising it."*
 *
 * A thrown error on this path renders the generic fault screen, which tells a customer SPEC is
 * broken when the truth is usually that Xero said no and said why. So every call answers either a
 * result or a REASON, in words worth putting in front of an accountant. And every call has a
 * deadline, because "it spins" is on that list and a fetch with no timeout spins forever.
 */

/** Long enough for a six-month P&L on a slow morning, short enough that nobody watches a spinner. */
export const REQUEST_TIMEOUT_MS = 20_000;

export interface XeroEndpoints {
  authorize: string;
  token: string;
  connections: string;
  report: string;
}

const REAL: XeroEndpoints = {
  authorize: AUTHORIZE_URL,
  token: TOKEN_URL,
  connections: CONNECTIONS_URL,
  report: REPORT_URL,
};

/**
 * Only this machine. Not a host name that resolves to it — the literal loopback addresses.
 *
 * This is the rule that makes the offline server safe to have at all, and it is deliberately a
 * property of the VALUE rather than a judgement about the environment.
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Where the requests go — and the two rules that make `XERO_FAKE_BASE` safe.
 *
 * `scripts/fake-xero.mjs` is only useful if the application can be pointed at it, and a variable
 * that redirects an OAuth token exchange is, on the face of it, a way to send a customer's
 * credentials somewhere else. So:
 *
 *   1. **A real deployment ignores it outright.** `VERCEL_ENV=production` is set by the platform
 *      and is not something a mistake in a settings box can produce.
 *   2. **Anywhere else, it can only ever be this machine.** A non-loopback address is ignored, so
 *      there is no value of this variable — on any host, in any environment — that sends a token
 *      exchange to somebody on the internet.
 *
 * The first version checked `NODE_ENV !== 'production'` and was both less safe and wrong: less
 * safe because it made exfiltration a matter of trusting a variable rather than impossible, and
 * wrong because `next start` sets NODE_ENV to production by design. Every journey in CI runs
 * against `next start`, so the offline server could never have been reached by the one thing built
 * to walk the flow — a safety check that also disabled the only proof the feature worked.
 */
export function endpoints(env: NodeJS.ProcessEnv = process.env): XeroEndpoints {
  const base = (env.XERO_FAKE_BASE ?? '').replace(/\/$/, '');
  if (!base) return REAL;
  if (env.VERCEL_ENV === 'production') return REAL;
  if (!LOOPBACK.test(base)) return REAL;
  return {
    authorize: `${base}/identity/connect/authorize`,
    token: `${base}/connect/token`,
    connections: `${base}/connections`,
    report: `${base}/api.xro/2.0/Reports/ProfitAndLoss`,
  };
}

export interface XeroApp {
  clientId: string;
  clientSecret: string;
  /** Fixed, and the same every time. See below. */
  redirectUri: string;
}

/**
 * Where Xero sends somebody back to.
 *
 * Built from APP_URL and never from the address the request arrived on — which is the opposite of
 * what `lib/origin` exists to do, and deliberately. Xero checks `redirect_uri` against the exact
 * list registered on the app: a per-origin address would be refused by Xero rather than merely
 * landing somebody on the wrong site, so the Stripe lesson does not transfer. A business reaching
 * SPEC on www is returned to the one registered address and lands signed in there.
 */
export const redirectUri = (base: string = appUrl()): string =>
  `${base.replace(/\/$/, '')}/connections/xero/callback`;

/**
 * The credentials for SPEC's Xero app, or null when this deployment has none.
 *
 * Null rather than a throw: "Xero is not set up on this deployment" is a sentence a screen should
 * be able to say calmly, and a page that throws instead tells a customer the product is broken.
 *
 * These two values come from Xero's developer console and go straight into the deployment's
 * environment settings. They are never written in this repository, a chat, a document or a log.
 */
export function xeroApp(env: NodeJS.ProcessEnv = process.env): XeroApp | null {
  const clientId = env.XERO_CLIENT_ID ?? '';
  const clientSecret = env.XERO_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: redirectUri(env.APP_URL ?? undefined) };
}

type Fetcher = typeof fetch;

/**
 * One request, with a deadline and no exceptions escaping.
 *
 * Returns the parsed body or a reason. Network faults, timeouts and non-JSON answers all arrive
 * here as the same kind of thing — something to tell somebody about — rather than as three
 * different ways to render the fault screen.
 */
async function ask(
  url: string,
  init: RequestInit,
  what: string,
  fetchImpl: Fetcher = fetch,
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; reason: string }> {
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /*
        Not JSON. Almost always an HTML error page from something in front of Xero — a proxy, a
        maintenance notice, a captive portal on the customer's own network. The status code is the
        useful part; the page body is not, and printing it at somebody would be alarming noise.
      */
      return {
        ok: false,
        reason: `Xero answered ${what} with something that was not a response SPEC understands (HTTP ${response.status}).`,
      };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      reason: timedOut
        ? `Xero did not answer ${what} within ${REQUEST_TIMEOUT_MS / 1000} seconds. Nothing was changed.`
        : `SPEC could not reach Xero to ${what}.`,
    };
  }
}

/** Code for tokens. The client secret goes in the header and never into a body or a log. */
export async function exchangeCode(
  code: string,
  app: XeroApp,
  { fetchImpl = fetch, env = process.env, now = new Date() } = {},
): Promise<TokenParse> {
  const answer = await ask(
    endpoints(env).token,
    {
      method: 'POST',
      headers: {
        authorization: basicAuth(app.clientId, app.clientSecret),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody(code, app.redirectUri),
    },
    'the sign-in exchange',
    fetchImpl,
  );
  if (!answer.ok) return { ok: false, reason: answer.reason };
  // parseTokens reads Xero's own `error`/`error_description`, which is more useful than a status.
  return parseTokens(answer.body, now);
}

/**
 * A fresh access token, and a NEW refresh token.
 *
 * Xero rotates the refresh token on every use: the one just sent is dead the moment this returns.
 * Whatever calls this has to store what comes back before using it — see `lib/xero-link`, which is
 * where that ordering is enforced and explained.
 */
export async function refreshTokens(
  refreshToken: string,
  app: XeroApp,
  { fetchImpl = fetch, env = process.env, now = new Date() } = {},
): Promise<TokenParse> {
  const answer = await ask(
    endpoints(env).token,
    {
      method: 'POST',
      headers: {
        authorization: basicAuth(app.clientId, app.clientSecret),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: refreshRequestBody(refreshToken),
    },
    'refresh the connection',
    fetchImpl,
  );
  if (!answer.ok) return { ok: false, reason: answer.reason };
  return parseTokens(answer.body, now);
}

export type OrgsRead = { ok: true; orgs: XeroOrg[] } | { ok: false; reason: string };

/** Which organisations the consent covers. */
export async function listOrgs(
  accessToken: string,
  { fetchImpl = fetch, env = process.env } = {},
): Promise<OrgsRead> {
  const answer = await ask(
    endpoints(env).connections,
    { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } },
    'list the organisations',
    fetchImpl,
  );
  if (!answer.ok) return { ok: false, reason: answer.reason };
  if (answer.status >= 400) {
    return { ok: false, reason: `Xero refused to list the organisations (HTTP ${answer.status}).` };
  }
  const orgs = parseConnections(answer.body);
  if (!orgs.length) {
    return {
      ok: false,
      reason: 'That Xero login is not attached to any organisation SPEC can read a Profit and Loss from.',
    };
  }
  return { ok: true, orgs };
}

export interface ReportRequest {
  accessToken: string;
  /** Xero's own word is "tenant". Renamed everywhere in SPEC — see the note in lib/xero. */
  xeroOrgId: string;
  /** The last month to include, as YYYY-MM-DD. */
  toDate: string;
  months: number;
}

/** The Profit and Loss, read into gross profit by month — or the reason there is none. */
export async function profitAndLoss(
  request: ReportRequest,
  { fetchImpl = fetch, env = process.env } = {},
): Promise<ReportRead> {
  const url = `${endpoints(env).report}?${reportQuery(request.toDate, request.months)}`;
  const answer = await ask(
    url,
    {
      headers: {
        authorization: `Bearer ${request.accessToken}`,
        'xero-tenant-id': request.xeroOrgId,
        accept: 'application/json',
      },
    },
    'read the Profit and Loss',
    fetchImpl,
  );
  if (!answer.ok) return { ok: false, reason: answer.reason };
  if (answer.status === 401 || answer.status === 403) {
    return {
      ok: false,
      reason: 'Xero would not let SPEC read that organisation. The connection may have been removed in Xero.',
    };
  }
  if (answer.status >= 400) {
    return { ok: false, reason: `Xero refused the Profit and Loss request (HTTP ${answer.status}).` };
  }
  // Everything that decides what the numbers MEAN is next door, and tested without a network.
  return grossProfit(answer.body);
}
