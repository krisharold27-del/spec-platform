/**
 * Xero, the half with no network in it.
 *
 * Kris, 18 September: *"yes start the xero connector"*. It is the piece his brief calls the single
 * biggest technical risk in the product — *"the instant they link Xero, the board must populate FAST
 * and CORRECTLY. If it spins, errors, or shows an unrecognised number, the anticipation inverts into
 * broken trust — worse than never promising it."*
 *
 * ── Why this file has no `fetch` in it ───────────────────────────────────────────────────────────
 *
 * Everything that can be decided without the network is decided here, so it can be tested without
 * one: what URL to send somebody to, what to post back, when a token is stale, and — the part that
 * carries the whole risk — **what a Profit and Loss report actually means**.
 *
 * "Correctly" does not live in the HTTP call. It lives in reading somebody's chart of accounts and
 * coming back with a number they recognise. That is a pure function of the response, so it is one
 * here, with the awkward shapes written down as tests rather than discovered on a customer.
 *
 * ── What I could not verify, stated plainly ──────────────────────────────────────────────────────
 *
 * This environment's egress proxy denies `api.xero.com`, `identity.xero.com` and `developer.xero.com`
 * outright, so **not one line of this has been run against Xero**. It is written to Xero's published
 * OAuth 2.0 and Accounting API contract, and `scripts/fake-xero.mjs` serves that contract so the
 * whole flow can be walked offline. The first real call has to happen somewhere the network is
 * allowed. Until it has, treat this as unproven against the live API however green the tests are —
 * that distinction is the entire lesson of `docs/MISTAKES.md`.
 *
 * ── The naming collision that will cause a bug if it is not named ────────────────────────────────
 *
 * Xero calls a connected organisation a **tenant**. SPEC calls a customer a **tenant**. They are
 * different things and they will both be in scope in the same function. Everything Xero means is
 * called `xeroOrgId` here and never `tenantId`, including where that disagrees with Xero's own
 * field names.
 */

/** Where a person is sent to say yes. */
export const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
/** Where codes and refresh tokens are exchanged. */
export const TOKEN_URL = 'https://identity.xero.com/connect/token';
/** Which organisations the consent covers. */
export const CONNECTIONS_URL = 'https://api.xero.com/connections';
/** The report itself. */
export const REPORT_URL = 'https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss';

/**
 * The least access that answers the question.
 *
 * `offline_access` is the one that is easy to leave out and impossible to add later without sending
 * the customer back through consent: without it Xero returns no refresh token, the connection dies
 * thirty minutes after it is made, and the board goes blank the next morning.
 *
 * Reports only. SPEC wants a gross profit figure, not the ledger — and a connector that asks for
 * more than it needs is one an accountant is right to refuse.
 */
export const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'accounting.reports.read'] as const;

/** Xero's access tokens last 30 minutes; refresh tokens last 60 days and ROTATE on every use. */
export const ACCESS_TOKEN_SECONDS = 30 * 60;
export const REFRESH_TOKEN_DAYS = 60;

/**
 * Refresh early, not late.
 *
 * A token that expires mid-request produces a 401 on the screen somebody is watching populate. Two
 * minutes of margin costs nothing and removes the whole class.
 */
export const REFRESH_MARGIN_SECONDS = 120;

export interface AuthorizeInput {
  clientId: string;
  redirectUri: string;
  /** Random, single use, and checked on the way back. Without it the callback accepts anybody's code. */
  state: string;
}

export function authorizeUrl(input: AuthorizeInput): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: SCOPES.join(' '),
    state: input.state,
  });
  return `${AUTHORIZE_URL}?${q}`;
}

/** The body of the code-for-token exchange. Credentials go in the header, never in here. */
export function tokenRequestBody(code: string, redirectUri: string): string {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  }).toString();
}

export function refreshRequestBody(refreshToken: string): string {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();
}

/**
 * HTTP Basic, which is how Xero wants the client credentials.
 *
 * Returned as a header value rather than logged, assembled or stored anywhere else. The secret this
 * is built from belongs in the deployment's environment and nowhere a person can read it.
 */
export const basicAuth = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO, absolute. Stored rather than a duration, because a duration is only true when it was read. */
  accessExpiresAt: string;
  scope: string;
}

export type TokenParse =
  | { ok: true; tokens: XeroTokens }
  | { ok: false; reason: string };

/**
 * Xero's token response, turned into something worth storing — or a refusal that says why.
 *
 * Refuses rather than coerces. A token response missing `refresh_token` is the `offline_access`
 * mistake above, and storing what came back would produce a connection that works this afternoon
 * and is dead tomorrow — the worst possible failure, because it looks like success.
 */
export function parseTokens(body: unknown, now: Date = new Date()): TokenParse {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Xero did not return a token response.' };
  const b = body as Record<string, unknown>;

  if (typeof b.error === 'string') {
    const detail = typeof b.error_description === 'string' ? `: ${b.error_description}` : '';
    return { ok: false, reason: `Xero refused the exchange (${b.error}${detail}).` };
  }
  if (typeof b.access_token !== 'string' || !b.access_token) {
    return { ok: false, reason: 'Xero returned no access token.' };
  }
  if (typeof b.refresh_token !== 'string' || !b.refresh_token) {
    return {
      ok: false,
      reason: 'Xero returned no refresh token, which means the connection would stop working in thirty '
        + 'minutes. The offline_access scope is missing.',
    };
  }
  const seconds = typeof b.expires_in === 'number' && b.expires_in > 0 ? b.expires_in : ACCESS_TOKEN_SECONDS;
  return {
    ok: true,
    tokens: {
      accessToken: b.access_token,
      refreshToken: b.refresh_token,
      accessExpiresAt: new Date(now.getTime() + seconds * 1000).toISOString(),
      scope: typeof b.scope === 'string' ? b.scope : '',
    },
  };
}

/** Is this access token too close to the end to start a request with? */
export const needsRefresh = (accessExpiresAt: string, now: Date = new Date()): boolean =>
  !accessExpiresAt || new Date(accessExpiresAt).getTime() - now.getTime() <= REFRESH_MARGIN_SECONDS * 1000;

/**
 * One organisation the consent covers.
 *
 * `xeroOrgId` is what Xero's `/connections` calls `tenantId`, renamed on the way in so the word
 * "tenant" in this codebase only ever means a SPEC customer. See the note at the top.
 */
export interface XeroOrg {
  xeroOrgId: string;
  name: string;
}

export function parseConnections(body: unknown): XeroOrg[] {
  if (!Array.isArray(body)) return [];
  return body
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    // Xero returns practice and other tenant types on the same endpoint; only an ORGANISATION has a
    // profit and loss.
    .filter(c => c.tenantType === undefined || c.tenantType === 'ORGANISATION')
    .map(c => ({
      xeroOrgId: String(c.tenantId ?? ''),
      name: String(c.tenantName ?? 'Unnamed organisation'),
    }))
    .filter(o => o.xeroOrgId);
}

/** The report request, as query parameters. Months, oldest first, ending with the month given. */
export function reportQuery(toDate: string, months: number): string {
  return new URLSearchParams({
    toDate,
    // `periods` is how many EXTRA periods to include, so six months is five.
    periods: String(Math.max(0, months - 1)),
    timeframe: 'MONTH',
  }).toString();
}

/* ── Reading the report, which is where "correctly" lives ────────────────────────────────────── */

export interface GrossProfitPoint {
  /** The column heading Xero gave, exactly — never a date this code invented. */
  period: string;
  amount: number;
}

export type ReportRead =
  | { ok: true; currencyHint: string | null; points: GrossProfitPoint[] }
  | { ok: false; reason: string };

interface Cell { Value?: unknown }
interface Row { RowType?: string; Title?: string; Cells?: Cell[]; Rows?: Row[] }

/** Every row, flattened — Xero nests rows inside Sections and the one we want can be at any depth. */
function flatten(rows: Row[] | undefined, out: Row[] = []): Row[] {
  for (const r of rows ?? []) {
    out.push(r);
    if (Array.isArray(r.Rows)) flatten(r.Rows, out);
  }
  return out;
}

const cellText = (c: Cell | undefined): string => (c?.Value === undefined || c?.Value === null ? '' : String(c.Value));

/**
 * A money cell, or null.
 *
 * Xero sends these as strings, sometimes with a currency symbol, sometimes with thousands
 * separators, and negatives sometimes in brackets the accounting way. An empty cell is NOT zero —
 * it is a month with no figure, and drawing it as zero would put a cliff on the board where nothing
 * happened.
 */
export function money(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  const digits = text.replace(/[()]/g, '').replace(/[^0-9.-]/g, '');
  if (!digits || !/[0-9]/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

/**
 * Gross profit, month by month, out of a Profit and Loss report.
 *
 * ── Found by NAME, deliberately, and not by position ─────────────────────────────────────────────
 *
 * Every business's chart of accounts is different, and so is the number of rows above the line. A
 * reader that counted rows would work on the first organisation it met and be quietly wrong on the
 * second — which is the exact failure that costs trust, because a wrong number looks like a number.
 *
 * So: find the row whose label reads "Gross Profit", take the period headings from the report's own
 * header row, and pair them up. If the row is not there, say so and show nothing. A board that says
 * "SPEC could not find Gross Profit in this report" is recoverable. A board showing the wrong figure
 * is not.
 */
export function grossProfit(body: unknown): ReportRead {
  const report = (body as { Reports?: unknown[] })?.Reports?.[0] as
    | { Rows?: Row[]; ReportTitles?: unknown[] }
    | undefined;
  if (!report || !Array.isArray(report.Rows)) {
    return { ok: false, reason: 'That response was not a Xero Profit and Loss report.' };
  }

  const rows = flatten(report.Rows);

  const header = rows.find(r => r.RowType === 'Header');
  if (!header?.Cells?.length) {
    return { ok: false, reason: 'The report had no period headings, so there is nothing to put on an axis.' };
  }
  // The first column is the account name; the rest are the periods.
  const periods = header.Cells.slice(1).map(cellText);

  const line = rows.find(r => /^\s*gross\s*profit\s*$/i.test(cellText(r.Cells?.[0])));
  if (!line) {
    return {
      ok: false,
      reason: 'SPEC could not find a Gross Profit line in this report. Some charts of accounts do not '
        + 'produce one — tell us and we will map it to the accounts you use.',
    };
  }

  const values = (line.Cells ?? []).slice(1);
  const points: GrossProfitPoint[] = [];
  for (let i = 0; i < periods.length; i++) {
    const amount = money(cellText(values[i]));
    // A month with no figure is left out rather than drawn as zero. See `money`.
    if (amount !== null && periods[i]) points.push({ period: periods[i], amount });
  }

  if (!points.length) {
    return { ok: false, reason: 'The Gross Profit line had no figures in it for the months asked for.' };
  }

  /*
    A title that is ONLY a currency code, and nothing looser.

    The first version looked for three capitals anywhere in a title and reported "JBI Electrical" as
    the currency — caught by the fixture, which is a business whose name happens to start with three
    capitals, which is most trade businesses. A wrong currency on a money chart is the same class of
    error as a wrong figure, so this says nothing rather than guessing.
  */
  const titles = (report.ReportTitles ?? []).map(String).map(t => t.trim());
  return { ok: true, currencyHint: titles.find(t => /^[A-Z]{3}$/.test(t)) ?? null, points };
}
