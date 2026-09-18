import { describe, it, expect } from 'vitest';
import {
  authorizeUrl, tokenRequestBody, refreshRequestBody, basicAuth, parseTokens, needsRefresh,
  parseConnections, reportQuery, money, grossProfit,
  SCOPES, ACCESS_TOKEN_SECONDS, REFRESH_MARGIN_SECONDS,
} from '../src/lib/xero';

/**
 * The Xero connector, tested where it can be.
 *
 * Kris's brief: *"the instant they link Xero, the board must populate FAST and CORRECTLY. If it
 * spins, errors, or shows an unrecognised number, the anticipation inverts into broken trust —
 * worse than never promising it."*
 *
 * **Correctly** is not in the HTTP call. It is in reading somebody else's chart of accounts and
 * coming back with a figure they recognise, and that is a pure function of the response — so the
 * awkward shapes are written down here rather than discovered on a customer.
 *
 * What these tests CANNOT do is prove any of it against Xero: this environment's proxy denies
 * api.xero.com outright. They hold the contract as published. Green here means the reading is right
 * IF the shape is what Xero documents, and nothing more than that.
 */

const NOW = new Date('2026-09-18T04:00:00.000Z');

describe('sending somebody to Xero', () => {
  it('ASKS FOR offline_access, which is the one that is fatal to forget', () => {
    /*
      Without it Xero returns no refresh token, the connection dies thirty minutes after it is made,
      and the board is blank the next morning. It cannot be added later without sending the customer
      back through consent.
    */
    expect(SCOPES).toContain('offline_access');
    expect(authorizeUrl({ clientId: 'c', redirectUri: 'https://x/cb', state: 's' })).toContain('offline_access');
  });

  it('asks for reports and NOTHING that writes', () => {
    // A connector that asks for more than it needs is one an accountant is right to refuse.
    expect(SCOPES).toContain('accounting.reports.read');
    for (const s of SCOPES) expect(s).not.toMatch(/\.write|transactions|payroll|contacts/);
  });

  it('carries the state, which is what stops the callback accepting anybody’s code', () => {
    const url = new URL(authorizeUrl({ clientId: 'abc', redirectUri: 'https://spec/cb', state: 'nonce-1' }));
    expect(url.searchParams.get('state')).toBe('nonce-1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('abc');
    expect(url.searchParams.get('redirect_uri')).toBe('https://spec/cb');
  });

  it('and the secret is never in the URL', () => {
    const url = authorizeUrl({ clientId: 'abc', redirectUri: 'https://spec/cb', state: 'n' });
    expect(url).not.toMatch(/secret/i);
  });
});

describe('the exchange', () => {
  it('posts the code and the same redirect, which Xero checks', () => {
    const body = new URLSearchParams(tokenRequestBody('the-code', 'https://spec/cb'));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('redirect_uri')).toBe('https://spec/cb');
  });

  it('CREDENTIALS GO IN THE HEADER, never the body', () => {
    // A body is logged by proxies and error handlers. A header is not the same risk.
    expect(tokenRequestBody('c', 'https://spec/cb')).not.toMatch(/client_secret/);
    expect(basicAuth('id', 'sec')).toBe(`Basic ${Buffer.from('id:sec').toString('base64')}`);
  });

  it('refreshing sends the refresh token and nothing else', () => {
    const body = new URLSearchParams(refreshRequestBody('r-1'));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('r-1');
  });
});

describe('what comes back', () => {
  const good = { access_token: 'a', refresh_token: 'r', expires_in: 1800, scope: 'x' };

  it('stores an ABSOLUTE expiry, not a duration', () => {
    // A duration is only true at the moment it was read. Stored, it starts lying immediately.
    const out = parseTokens(good, NOW);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.tokens.accessExpiresAt).toBe('2026-09-18T04:30:00.000Z');
  });

  it('REFUSES A RESPONSE WITH NO REFRESH TOKEN, and says what is wrong', () => {
    /*
      The worst failure available, because it looks like success: the connection works this
      afternoon and is dead tomorrow. Storing it would put a board in front of somebody that goes
      blank overnight with no explanation.
    */
    const out = parseTokens({ ...good, refresh_token: undefined }, NOW);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toMatch(/thirty minutes/);
      expect(out.reason).toMatch(/offline_access/);
    }
  });

  it('passes Xero’s own error through rather than inventing one', () => {
    const out = parseTokens({ error: 'invalid_grant', error_description: 'code expired' }, NOW);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('invalid_grant');
    if (!out.ok) expect(out.reason).toContain('code expired');
  });

  it('refuses nonsense instead of half-storing it', () => {
    for (const body of [null, undefined, 'a string', 42, {}]) {
      expect(parseTokens(body as unknown, NOW).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('falls back to thirty minutes when Xero omits the duration', () => {
    const out = parseTokens({ access_token: 'a', refresh_token: 'r' }, NOW);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(new Date(out.tokens.accessExpiresAt).getTime() - NOW.getTime()).toBe(ACCESS_TOKEN_SECONDS * 1000);
    }
  });
});

describe('refreshing early rather than late', () => {
  it('REFRESHES BEFORE THE END, not at it', () => {
    /*
      A token that expires mid-request produces a 401 on the screen somebody is watching populate.
      Two minutes of margin removes the whole class for nothing.
    */
    const endsAt = new Date(NOW.getTime() + (REFRESH_MARGIN_SECONDS - 1) * 1000).toISOString();
    expect(needsRefresh(endsAt, NOW)).toBe(true);
  });

  it('leaves a healthy token alone', () => {
    expect(needsRefresh(new Date(NOW.getTime() + 20 * 60_000).toISOString(), NOW)).toBe(false);
  });

  it('treats a missing or past expiry as stale', () => {
    expect(needsRefresh('', NOW)).toBe(true);
    expect(needsRefresh(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe(true);
  });
});

describe('which organisations the consent covers', () => {
  it('renames Xero’s "tenantId" so the word only ever means a SPEC customer', () => {
    /*
      Xero calls a connected organisation a tenant. SPEC calls a customer a tenant. Both are in scope
      in the same functions, and leaving them sharing a name is a bug with a date on it.
    */
    const orgs = parseConnections([{ tenantId: 'x-1', tenantName: 'JBI Electrical', tenantType: 'ORGANISATION' }]);
    expect(orgs).toEqual([{ xeroOrgId: 'x-1', name: 'JBI Electrical' }]);
  });

  it('skips tenant types that have no profit and loss', () => {
    const orgs = parseConnections([
      { tenantId: 'a', tenantName: 'Practice', tenantType: 'PRACTICE' },
      { tenantId: 'b', tenantName: 'Real', tenantType: 'ORGANISATION' },
    ]);
    expect(orgs.map(o => o.xeroOrgId)).toEqual(['b']);
  });

  it('survives an empty or malformed list without throwing', () => {
    expect(parseConnections([])).toEqual([]);
    expect(parseConnections(null)).toEqual([]);
    expect(parseConnections([null, 3, { tenantName: 'no id' }])).toEqual([]);
  });
});

describe('asking for six months', () => {
  it('asks for five EXTRA periods, because that is what Xero counts', () => {
    // Off by one here is six months of chart with five months on it, or seven.
    const q = new URLSearchParams(reportQuery('2026-09-30', 6));
    expect(q.get('periods')).toBe('5');
    expect(q.get('timeframe')).toBe('MONTH');
    expect(q.get('toDate')).toBe('2026-09-30');
  });

  it('never asks for a negative number of periods', () => {
    expect(new URLSearchParams(reportQuery('2026-09-30', 0)).get('periods')).toBe('0');
  });
});

describe('reading money out of a cell', () => {
  it('reads a plain figure', () => {
    expect(money('12345.67')).toBe(12345.67);
  });

  it('reads the symbols and separators Xero sends', () => {
    expect(money('$1,234.50')).toBe(1234.5);
    expect(money(' 1 234 ')).toBe(1234);
  });

  it('READS ACCOUNTING BRACKETS AS NEGATIVE', () => {
    // A loss shown as (4,000) read as positive 4000 is a board saying the opposite of the truth.
    expect(money('(4,000.00)')).toBe(-4000);
    expect(money('-250')).toBe(-250);
  });

  it('AN EMPTY CELL IS NOT ZERO', () => {
    /*
      A month with no figure drawn as zero puts a cliff on the chart where nothing happened, and the
      first thing somebody does with a cliff is ask what went wrong that month.
    */
    expect(money('')).toBeNull();
    expect(money('   ')).toBeNull();
    expect(money('-')).toBeNull();
  });
});

/* ── The report, which is the whole risk ──────────────────────────────────────────────────────── */

const report = (rows: unknown[], titles: string[] = ['JBI Electrical', 'Profit and Loss', 'AUD']) => ({
  Reports: [{ ReportTitles: titles, Rows: rows }],
});

const header = (...periods: string[]) => ({
  RowType: 'Header',
  Cells: [{ Value: '' }, ...periods.map(p => ({ Value: p }))],
});

const line = (label: string, ...values: string[]) => ({
  RowType: 'SummaryRow',
  Cells: [{ Value: label }, ...values.map(v => ({ Value: v }))],
});

describe('gross profit out of a Profit and Loss', () => {
  it('PAIRS EACH FIGURE WITH XERO’S OWN PERIOD HEADING', () => {
    // Never a date this code invented: the axis has to say what the customer's own report says.
    const out = grossProfit(report([
      header('Apr 2026', 'May 2026', 'Jun 2026'),
      line('Total Income', '100', '110', '120'),
      line('Gross Profit', '40', '44', '48'),
    ]));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.points).toEqual([
        { period: 'Apr 2026', amount: 40 },
        { period: 'May 2026', amount: 44 },
        { period: 'Jun 2026', amount: 48 },
      ]);
    }
  });

  it('FINDS THE LINE BY NAME, whatever is above it', () => {
    /*
      The reason this is not read by row number. Every chart of accounts is a different length, so a
      reader that counted rows would be right on the first organisation it met and quietly wrong on
      the second — and a wrong number looks exactly like a number.
    */
    const out = grossProfit(report([
      header('Jun 2026'),
      line('Sales', '1'), line('Other Revenue', '2'), line('Contract Income', '3'),
      line('Total Income', '6'), line('Materials', '1'), line('Subcontractors', '2'),
      line('Total Cost of Sales', '3'),
      line('Gross Profit', '3'),
    ]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.points).toEqual([{ period: 'Jun 2026', amount: 3 }]);
  });

  it('finds it nested inside a Section', () => {
    // Xero nests rows; the line can be at any depth.
    const out = grossProfit(report([
      header('Jun 2026'),
      { RowType: 'Section', Title: 'Trading', Rows: [line('Gross Profit', '99')] },
    ]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.points[0].amount).toBe(99);
  });

  it('is not fooled by a similarly named line', () => {
    const out = grossProfit(report([
      header('Jun 2026'),
      line('Gross Profit Percentage', '42'),
      line('Gross Profit', '1000'),
    ]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.points[0].amount).toBe(1000);
  });

  it('SAYS SO WHEN THERE IS NO GROSS PROFIT LINE, and shows nothing', () => {
    /*
      Some charts of accounts genuinely do not produce one. A board saying "SPEC could not find Gross
      Profit in this report" is recoverable in a sentence. A board showing the wrong figure is not
      recoverable at all, because nobody knows to doubt it.
    */
    const out = grossProfit(report([header('Jun 2026'), line('Net Profit', '10')]));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/could not find a Gross Profit line/i);
  });

  it('refuses a response that is not a report at all', () => {
    for (const body of [null, {}, { Reports: [] }, { Reports: [{}] }, 'nope']) {
      expect(grossProfit(body as unknown).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('leaves out a month with no figure rather than drawing a zero', () => {
    const out = grossProfit(report([
      header('Apr 2026', 'May 2026', 'Jun 2026'),
      line('Gross Profit', '40', '', '48'),
    ]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.points.map(p => p.period)).toEqual(['Apr 2026', 'Jun 2026']);
  });

  it('carries a loss through as a loss', () => {
    const out = grossProfit(report([header('Jun 2026'), line('Gross Profit', '(2,500.00)')]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.points[0].amount).toBe(-2500);
  });

  it('and says which currency the report was in, when it can tell', () => {
    const out = grossProfit(report([header('Jun 2026'), line('Gross Profit', '1')]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.currencyHint).toBe('AUD');
  });
});
