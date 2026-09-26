/**
 * SiteVIP's end of the Angus Shield connection — pure parts only (no database, no network).
 *
 * docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md is the authority: OAuth 2.0 authorisation code with PKCE
 * (§1), the event envelope and timing (§3), and signed webhooks both ways (§4). Angus Shield is a
 * separate product with its own database and login; this connection is the only door between them
 * (Kris, 25 September: "Separate product, one connection through the contract").
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const PROVIDER = 'angus_shield';
export const CONTRACT = '1.0.0';
export const MAX_SKEW_SECONDS = 300;
/** Carries the sealed state and PKCE verifier across the sign-in round trip. */
export const ANGUS_STATE_COOKIE = 'spec_angus_state';

export interface AngusApp { base: string; clientId: string; clientSecret: string; redirectUri: string }

/** Settings for the connection, or null when this deployment has not been given them. */
export function angusApp(env: Record<string, string | undefined> = process.env): AngusApp | null {
  const secret = env.ANGUS_SHIELD_CLIENT_SECRET?.trim();
  const appUrl = (env.APP_URL ?? env.NEXT_PUBLIC_APP_URL)?.trim().replace(/\/$/, '');
  if (!secret || !appUrl) return null;
  return {
    base: (env.ANGUS_SHIELD_URL?.trim() || 'https://angusshield.com').replace(/\/$/, ''),
    clientId: env.ANGUS_SHIELD_CLIENT_ID?.trim() || 'sitevip',
    clientSecret: secret,
    redirectUri: `${appUrl}/connections/angus-shield/callback`,
  };
}

/** PKCE (S256): the verifier stays with us; only its hash goes to Angus Shield. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(app: AngusApp, state: string, challenge: string): string {
  const q = new URLSearchParams({
    response_type: 'code', client_id: app.clientId, redirect_uri: app.redirectUri, state,
    code_challenge: challenge, code_challenge_method: 'S256', scope: 'sitevip.v1',
  });
  return `${app.base}/oauth/authorize?${q}`;
}

export function codeBody(app: AngusApp, code: string, verifier: string): string {
  return new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: app.redirectUri, client_id: app.clientId, client_secret: app.clientSecret }).toString();
}

export function refreshBody(app: AngusApp, refreshToken: string): string {
  return new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: app.clientId, client_secret: app.clientSecret }).toString();
}

export interface AngusTokens { accessToken: string; refreshToken: string; expiresIn: number; angusId: string; signingSecret: string | null }

/** Reads Angus Shield's token answer, refusing anything that isn't the shape the contract gives. */
export function parseTokens(body: unknown): AngusTokens | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string' || typeof b.angus_id !== 'string') return null;
  return {
    accessToken: b.access_token, refreshToken: b.refresh_token, angusId: b.angus_id,
    expiresIn: typeof b.expires_in === 'number' ? b.expires_in : 900,
    signingSecret: typeof b.signing_secret === 'string' && b.signing_secret.length >= 32 ? b.signing_secret : null,
  };
}

/** `t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>` — the same shape both ways (§4). */
export function signatureHeader(secret: string, body: string, nowMs = Date.now()): string {
  const t = String(Math.floor(nowMs / 1000));
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

export function signatureOk(secret: string | null | undefined, header: string | null, body: string, nowMs = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=') as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > MAX_SKEW_SECONDS) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex'));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface Envelope { contract: string; event_id: string; type: string; occurred_at: string; tenant: { sitevip_id: string; angus_id: string }; data: unknown }

export function envelope(type: string, data: unknown, ids: { sitevip: string; angus: string }, eventId: string, occurredAt: string): Envelope {
  return { contract: CONTRACT, event_id: eventId, type, occurred_at: occurredAt, tenant: { sitevip_id: ids.sitevip, angus_id: ids.angus }, data };
}

/** Which event a stage change is (§3): won, completed when a job leaves onsite, quoted, or just the stage. */
export function stageEvent(from: string, to: string): string {
  if (to === 'won') return 'job.won';
  if (from === 'onsite') return 'job.completed';
  if (to === 'quoted') return 'job.quoted';
  return 'job.stage_changed';
}

export interface JobForEvent { id: string; ref: string; title: string; client: string; site?: string | null; stage: string; valueCents?: number | null }

/** The full current state of a job (every event carries it, so a late or repeated one does no harm). */
export function jobData(j: JobForEvent, customer: { name: string; email?: string | null; phone?: string | null } | null) {
  return {
    sitevip_id: j.id, ref: j.ref, name: [j.title, j.site].filter(Boolean).join(', '), stage: j.stage,
    quote_cents: j.valueCents ?? null,
    customer: customer ? { name: customer.name, email: customer.email ?? null, phone: customer.phone ?? null } : { name: j.client },
  };
}

export interface HoursEntry { id: string; personKey: string; personName: string; email?: string | null; day: string; minutes: number; billable?: boolean | null; allowances?: string | null; jobRef?: string | null; approvedBy?: string | null; approvedAt?: string | null }

const ALLOWANCE_TAGS: Record<string, string> = { site: 'site', 'site allowance': 'site', meal: 'meal', 'meal allowance': 'meal', overtime: 'overtime' };

/** Approved timesheet entries, as `hours.approved` data. Never pay rates: Angus Shield owns pay. */
export function hoursData(entries: HoursEntry[]) {
  return {
    entries: entries.filter(e => e.minutes > 0).map(e => ({
      sitevip_id: e.id,
      person: { sitevip_id: e.personKey, email: e.email ?? undefined, name: e.personName },
      job: e.jobRef ? { ref: e.jobRef } : null,
      day: e.day, minutes: e.minutes, billable: e.billable ?? undefined,
      allowances: (e.allowances ?? '').split(/[;,]/).map(a => ALLOWANCE_TAGS[a.trim().toLowerCase()] ?? a.trim()).filter(Boolean),
      approved_by: e.approvedBy ?? undefined, approved_at: e.approvedAt ?? undefined,
    })),
  };
}

/** A job bill agreed or marked to send, as `invoice.requested` (Angus Shield makes its own invoice from it). */
export function invoiceRequestData(bill: { id: string; kind: string; what: string; amountCents: number }, job: JobForEvent, customer: { name: string; email?: string | null } | null) {
  return {
    sitevip_id: bill.id, kind: bill.kind, job: { sitevip_id: job.id, ref: job.ref },
    customer: customer ? { name: customer.name, email: customer.email ?? null } : { name: job.client },
    reference: job.ref,
    lines: [{ description: bill.what, quantity: 1, unit_cents: bill.amountCents }],
  };
}

/** Retry after 1, 5, 15 and 60 minutes, then hourly, for 24 hours (§3). Null means stop. */
export function nextAttempt(attempts: number, firstAtMs: number, nowMs: number): number | null {
  const minutes = [1, 5, 15, 60][attempts - 1] ?? 60 * (attempts - 3);
  const at = Math.max(nowMs + 60_000, firstAtMs + minutes * 60_000);
  return at - firstAtMs > 24 * 3_600_000 ? null : at;
}
