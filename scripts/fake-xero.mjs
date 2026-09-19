import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

/**
 * Xero's contract, served on this desk.
 *
 * ── Why this has to exist ────────────────────────────────────────────────────────────────────────
 *
 * This environment's egress proxy denies `api.xero.com`, `identity.xero.com` and `login.xero.com`,
 * so no line of the connector can be run against Xero from here. The choice was between shipping
 * an OAuth flow nobody had ever walked, and building the other end of it.
 *
 * `src/lib/xero.ts` has claimed since 18 September that this file exists. It did not. That is the
 * fault this codebase keeps finding — a claim nobody checks — and it was sitting in the comment at
 * the top of the file about not trusting claims.
 *
 * ── What it does and does not prove ──────────────────────────────────────────────────────────────
 *
 * It answers Xero's published OAuth 2.0 and Accounting API contract: the consent screen, the code
 * exchange, refresh-token ROTATION, `/connections`, and a Profit and Loss in Xero's nested row
 * shape. So it proves SPEC's wiring, its refusals and its rotation handling end to end.
 *
 * It does not prove Xero agrees with any of it. Nothing here is evidence about the real API, and
 * the first real call still has to happen somewhere the network is allowed.
 *
 * ── The scenarios, which are the point ───────────────────────────────────────────────────────────
 *
 * The happy path is the least interesting thing a fake can do. `?scenario=` makes the awkward ones
 * reachable on demand:
 *
 *   ok          one organisation, a clean P&L                       (the default)
 *   many        three organisations, so the "which books" branch runs
 *   no-refresh  a token response with no refresh_token — the offline_access mistake
 *   no-gp       a P&L with no Gross Profit line, which some charts of accounts really do
 *   refuse      the token endpoint answers Xero's own error shape
 *   slow        answers after a delay, to exercise the deadline
 *
 *   node scripts/fake-xero.mjs 5055
 */

const PORT = Number(process.argv[2] ?? 5055);
/**
 * The scenario this server is playing, for the whole run.
 *
 * Given on the command line rather than in a query string, because SPEC builds the authorize URL
 * itself and would have no reason to carry one — and a fake that can only be steered by the code
 * under test is a fake that can only test the happy path.
 */
const SCENARIO = process.argv[3] ?? 'ok';

/** Everything this run has handed out. In memory: a fake that persists is a fake with a bug. */
const codes = new Map();          // code -> { scenario, redirectUri, scope }
const refreshTokens = new Map();  // token -> { scenario, generation }
const accessTokens = new Map();   // token -> { scenario }

const send = (res, status, body, type = 'application/json') => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(text) });
  res.end(text);
};

const readBody = req => new Promise(resolve => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => resolve(raw));
});

const ORGS = {
  ok: [{ tenantId: 'org-jbi', tenantName: 'JBI Electrical Pty Ltd', tenantType: 'ORGANISATION' }],
  many: [
    { tenantId: 'org-jbi', tenantName: 'JBI Electrical Pty Ltd', tenantType: 'ORGANISATION' },
    { tenantId: 'org-trust', tenantName: 'Harold Family Trust', tenantType: 'ORGANISATION' },
    // A practice is not an organisation with a P&L, and SPEC filters these out. Here so it can.
    { tenantId: 'org-practice', tenantName: "Someone Else's Accountants", tenantType: 'PRACTICE' },
  ],
};

/**
 * A Profit and Loss in Xero's real shape: nested Rows, a Header row whose first cell is the
 * account column, money as strings, an empty cell for a month with no figure, and a negative in
 * accounting brackets. Every one of those is a thing `grossProfit` and `money` have to survive.
 */
const profitAndLoss = (withGrossProfit = true) => ({
  Reports: [{
    ReportName: 'ProfitAndLoss',
    ReportTitles: ['Profit and Loss', 'JBI Electrical Pty Ltd', 'AUD', '1 April 2026 to 30 September 2026'],
    Rows: [
      {
        RowType: 'Header',
        Cells: [{ Value: '' }, { Value: 'Jul 2026' }, { Value: 'Aug 2026' }, { Value: 'Sep 2026' }],
      },
      {
        RowType: 'Section',
        Title: 'Income',
        Rows: [
          { RowType: 'Row', Cells: [{ Value: 'Electrical contracting' }, { Value: '412,800.00' }, { Value: '398,220.50' }, { Value: '441,010.00' }] },
          { RowType: 'SummaryRow', Cells: [{ Value: 'Total Income' }, { Value: '412,800.00' }, { Value: '398,220.50' }, { Value: '441,010.00' }] },
        ],
      },
      {
        RowType: 'Section',
        Title: 'Less Cost of Sales',
        Rows: [
          { RowType: 'Row', Cells: [{ Value: 'Materials' }, { Value: '181,004.00' }, { Value: '176,900.00' }, { Value: '(2,140.00)' }] },
          { RowType: 'SummaryRow', Cells: [{ Value: 'Total Cost of Sales' }, { Value: '285,600.00' }, { Value: '279,110.00' }, { Value: '302,880.00' }] },
        ],
      },
      withGrossProfit
        ? {
          RowType: 'Section',
          Title: '',
          Rows: [{
            RowType: 'SummaryRow',
            // The middle month is empty on purpose: a month with no figure is NOT zero, and drawing
            // it as zero would put a cliff on a board where nothing happened.
            Cells: [{ Value: 'Gross Profit' }, { Value: '127,200.00' }, { Value: '' }, { Value: '138,130.00' }],
          }],
        }
        : {
          RowType: 'Section',
          Title: '',
          // Some charts of accounts genuinely produce no Gross Profit line. SPEC must say so rather
          // than pick the nearest-looking row.
          Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Operating Surplus' }, { Value: '127,200.00' }] }],
        },
    ],
  }],
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const scenario = url.searchParams.get('scenario') ?? SCENARIO;

  if (scenario === 'slow' && url.pathname !== '/identity/connect/authorize') {
    await new Promise(r => setTimeout(r, 30_000));
  }

  /*
    The consent screen. The real one asks a person to sign in and press Allow; this one redirects
    straight back, because what is being tested is SPEC's two ends and not Xero's login form.

    It echoes `state` back untouched, which is what makes the state check on the way home a real
    check rather than one that passes because both sides made it up.
  */
  if (url.pathname === '/identity/connect/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const want = url.searchParams.get('scope') ?? '';
    const code = randomBytes(12).toString('hex');
    // The scenario travels with the code, so every later call answers consistently even when two
    // are in flight — a fake whose branches are decided by global state has its own bugs.
    codes.set(code, { scenario, redirectUri, scope: want });

    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    back.searchParams.set('state', state);
    res.writeHead(302, { location: back.toString() });
    res.end();
    return;
  }

  if (url.pathname === '/connect/token' && req.method === 'POST') {
    const auth = req.headers.authorization ?? '';
    // Xero wants the client credentials as HTTP Basic. A connector that sent them in the body
    // would work against a lenient fake and fail against Xero, so this one is not lenient.
    if (!auth.startsWith('Basic ')) {
      return send(res, 401, { error: 'invalid_client', error_description: 'Client credentials must be HTTP Basic.' });
    }

    const form = new URLSearchParams(await readBody(req));
    const grant = form.get('grant_type');

    let context;
    if (grant === 'authorization_code') {
      const code = form.get('code') ?? '';
      context = codes.get(code);
      if (!context) {
        return send(res, 400, { error: 'invalid_grant', error_description: 'That code is not one we issued.' });
      }
      // Single use, exactly like Xero. A connector that retries a spent code has a bug.
      codes.delete(code);
      if (form.get('redirect_uri') !== context.redirectUri) {
        return send(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri does not match.' });
      }
    } else if (grant === 'refresh_token') {
      const token = form.get('refresh_token') ?? '';
      context = refreshTokens.get(token);
      if (!context) {
        return send(res, 400, {
          error: 'invalid_grant',
          error_description: 'That refresh token has been used or revoked.',
        });
      }
      /*
        ROTATION, which is the whole reason this endpoint is worth faking.

        Xero retires a refresh token the moment it is spent. A connector that uses the new access
        token but forgets to store the new refresh token has a connection that works for the rest
        of the request and is permanently dead afterwards — and it cannot be caught by any test
        that does not model this.
      */
      refreshTokens.delete(token);
    } else {
      return send(res, 400, { error: 'unsupported_grant_type' });
    }

    if (context.scenario === 'refuse') {
      return send(res, 400, { error: 'invalid_grant', error_description: 'The authorisation was withdrawn.' });
    }
    const access = `access-${randomBytes(8).toString('hex')}`;
    accessTokens.set(access, { scenario: context.scenario });

    if (context.scenario === 'no-refresh') {
      // What Xero really returns when offline_access was not asked for.
      return send(res, 200, { access_token: access, expires_in: 1800, token_type: 'Bearer', scope: context.scope ?? '' });
    }

    const generation = (context.generation ?? 0) + 1;
    const refresh = `refresh-${generation}-${randomBytes(8).toString('hex')}`;
    refreshTokens.set(refresh, { ...context, generation });
    return send(res, 200, {
      access_token: access,
      refresh_token: refresh,
      expires_in: 1800,
      token_type: 'Bearer',
      scope: 'openid profile email offline_access accounting.reports.read',
    });
  }

  /** The scenario belonging to the bearer token on THIS request, not to the server as a whole. */
  const bearer = () => accessTokens.get((req.headers.authorization ?? '').replace(/^Bearer /, ''));

  if (url.pathname === '/connections') {
    const caller = bearer();
    if (!caller) return send(res, 401, { Title: 'Unauthorized' });
    // Almost every real business is one organisation. `many` is the group / trust / practice case.
    return send(res, 200, caller.scenario === 'many' ? ORGS.many : ORGS.ok);
  }

  if (url.pathname === '/api.xro/2.0/Reports/ProfitAndLoss') {
    const caller = bearer();
    if (!caller) return send(res, 401, { Title: 'Unauthorized' });
    // Xero refuses without this header rather than guessing which books, and so does this.
    if (!req.headers['xero-tenant-id']) return send(res, 403, { Title: 'Forbidden', Detail: 'No Xero-tenant-id header.' });
    return send(res, 200, profitAndLoss(caller.scenario !== 'no-gp'));
  }

  send(res, 404, { Title: 'Not Found', Detail: url.pathname });
});

server.listen(PORT, () => {
  console.log(`[fake-xero] answering Xero's contract on http://localhost:${PORT}`);
  console.log('[fake-xero] this is NOT Xero. Nothing it says is evidence about the real API.');
});
