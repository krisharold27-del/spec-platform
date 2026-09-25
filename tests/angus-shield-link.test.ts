import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  angusApp, authorizeUrl, envelope, hoursData, invoiceRequestData, jobData, nextAttempt, parseTokens, pkce, signatureHeader,
  signatureOk, stageEvent,
} from '../src/lib/angus-shield-link';

const env = { ANGUS_SHIELD_CLIENT_SECRET: 'as_secret_x', APP_URL: 'https://app.specbizhq.com/' };

describe('the Angus Shield connection, SiteVIP’s end (docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md)', () => {
  it('is off until this deployment has its settings, then asks with PKCE for the contract scope', () => {
    expect(angusApp({})).toBeNull();
    const app = angusApp(env)!;
    expect(app).toEqual({ base: 'https://angusshield.com', clientId: 'sitevip', clientSecret: 'as_secret_x', redirectUri: 'https://app.specbizhq.com/connections/angus-shield/callback' });
    const { verifier, challenge } = pkce();
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    const u = new URL(authorizeUrl(app, 'st', challenge));
    expect(u.origin + u.pathname).toBe('https://angusshield.com/oauth/authorize');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: 'code', client_id: 'sitevip', state: 'st', code_challenge: challenge, code_challenge_method: 'S256', scope: 'sitevip.v1' });
    expect(u.searchParams.get('code_verifier')).toBeNull(); // the verifier never leaves SiteVIP until the exchange
  });

  it('only accepts a token answer with the tokens, the business’s id and a real signing secret', () => {
    expect(parseTokens({ access_token: 'a', refresh_token: 'r', angus_id: 'id', expires_in: 900, signing_secret: 'x'.repeat(64) })).toMatchObject({ angusId: 'id', signingSecret: 'x'.repeat(64) });
    expect(parseTokens({ access_token: 'a', refresh_token: 'r', angus_id: 'id', signing_secret: 'short' })!.signingSecret).toBeNull();
    expect(parseTokens({ access_token: 'a' })).toBeNull();
  });

  it('signs and checks events the contract’s way: t=<unix>,v1=<HMAC(secret, t.body)>, five minutes at most', () => {
    const secret = 'y'.repeat(64);
    const now = 1_790_000_000_000;
    const h = signatureHeader(secret, '{"a":1}', now);
    const t = String(now / 1000);
    expect(h).toBe(`t=${t},v1=${createHmac('sha256', secret).update(`${t}.{"a":1}`).digest('hex')}`);
    expect(signatureOk(secret, h, '{"a":1}', now)).toBe(true);
    expect(signatureOk(secret, h, '{"a":2}', now)).toBe(false);
    expect(signatureOk(secret, h, '{"a":1}', now + 301_000)).toBe(false);
    expect(signatureOk(null, h, '{"a":1}', now)).toBe(false);
  });

  it('names stage changes as the contract does: won, completed on leaving onsite, quoted, otherwise the stage', () => {
    expect(stageEvent('quoted', 'won')).toBe('job.won');
    expect(stageEvent('onsite', 'invoiced')).toBe('job.completed');
    expect(stageEvent('enquiry', 'quoted')).toBe('job.quoted');
    expect(stageEvent('won', 'scheduled')).toBe('job.stage_changed');
  });

  it('sends approved hours in exactly the shape Angus Shield reads (the shared contract fixture), and never a pay rate', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/contract-v1/hours.approved.json', 'utf8'));
    const data = hoursData([
      { id: 'te-1', personKey: 'k1', personName: 'Mia Torres', email: 'mia@ironbark.example', day: '2026-09-14', minutes: 456, billable: true, allowances: 'Site allowance', jobRef: 'J-2291', approvedBy: 'Supervisor', approvedAt: '2026-09-20T07:00:00Z' },
      { id: 'te-2', personKey: 'k1', personName: 'Mia Torres', email: 'mia@ironbark.example', day: '2026-09-19', minutes: 240, billable: true, allowances: 'overtime', jobRef: 'J-2291', approvedBy: 'Supervisor', approvedAt: '2026-09-20T07:00:00Z' },
      { id: 'te-3', personKey: 'k1', personName: 'Mia Torres', day: '2026-09-20', minutes: 0 },
    ]);
    expect(data.entries.map(e => ({ ...e, person: { email: e.person.email } }))).toEqual(fixture.data.entries.map((e: { person: { email: string } }) => ({ ...e, person: { email: e.person.email } })));
    expect(JSON.stringify(data)).not.toMatch(/rate|cents|salary|tfn/i);
    const env1 = envelope('hours.approved', data, { sitevip: 's', angus: 'a' }, 'e1', '2026-09-21T06:00:00Z');
    expect(env1).toMatchObject({ contract: '1.0.0', event_id: 'e1', type: 'hours.approved', tenant: { sitevip_id: 's', angus_id: 'a' } });
  });

  it('carries a job’s full state, and a bill as Angus Shield’s invoice request', () => {
    const job = { id: 'j1', ref: 'J-2291', title: 'Fit-out', site: '12 Smith St', client: 'Harbour Dental', stage: 'won', valueCents: 1_000_000 };
    expect(jobData(job, { name: 'Harbour Dental', email: 'a@h.example' })).toEqual({ sitevip_id: 'j1', ref: 'J-2291', name: 'Fit-out, 12 Smith St', stage: 'won', quote_cents: 1_000_000, customer: { name: 'Harbour Dental', email: 'a@h.example', phone: null } });
    expect(invoiceRequestData({ id: 'b1', kind: 'claim', what: 'Stage 1', amountCents: 400_000 }, job, null)).toEqual({
      sitevip_id: 'b1', kind: 'claim', job: { sitevip_id: 'j1', ref: 'J-2291' }, customer: { name: 'Harbour Dental' }, reference: 'J-2291',
      lines: [{ description: 'Stage 1', quantity: 1, unit_cents: 400_000 }],
    });
  });

  it('retries at 1, 5, 15 and 60 minutes, then hourly, and stops after a day', () => {
    const t0 = 0;
    expect([1, 2, 3, 4].map(a => nextAttempt(a, t0, t0) ! / 60_000)).toEqual([1, 5, 15, 60]);
    expect(nextAttempt(5, t0, t0)! / 60_000).toBe(120);
    expect(nextAttempt(30, t0, t0)).toBeNull();
  });

  it('is wired where things happen: approving hours, moving a job, agreeing or sending a bill, and the five-minute retry', () => {
    const src = (p: string) => readFileSync(p, 'utf8');
    expect(src('src/lib/timesheets-data.ts')).toMatch(/emitHoursApproved\(user\.tenantId, ids\)/);
    const jobs = src('src/app/jobs/actions.ts');
    expect(jobs).toMatch(/emitJobStage\(user\.tenantId, job\.id, job\.stage\)/);
    expect((jobs.match(/emitInvoiceRequest\(user\.tenantId, id\)/g) ?? []).length).toBe(2);
    expect(src('src/app/api/ping/route.ts')).toMatch(/deliverAngus\(/);
    // Tokens and the signing secret are only ever written sealed.
    const data = src('src/lib/angus-shield-data.ts');
    expect(data).toMatch(/refreshTokenSealed: seal\(/);
    expect(data).toMatch(/signingSecretSealed: seal\(/);
    // A refresh token works once: the refresh holds a row lock.
    expect(data).toMatch(/\.for\('update'\)/);
  });
});
