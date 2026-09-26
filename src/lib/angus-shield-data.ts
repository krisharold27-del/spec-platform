/**
 * SiteVIP's end of the Angus Shield connection: the credential, the events out, the events in.
 *
 * The contract (docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md) is the authority. Tokens and the signing
 * secret are sealed (lib/secret-box). Every outgoing event is written to `connection_outbox` first
 * and sent after the response, retried for a day; every incoming event is checked against the
 * connection's own secret and applied once. Angus Shield is master of money; SiteVIP is master of
 * jobs, hours and crew — so nothing here ever changes an amount SiteVIP does not own.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { after } from 'next/server';
import { db, schema } from '../db';
import { open, seal } from './secret-box';
import {
  PROVIDER, angusApp, codeBody, envelope, hoursData, invoiceRequestData, jobData, nextAttempt, parseTokens, refreshBody, signatureHeader, signatureOk, stageEvent,
  type AngusApp, type AngusTokens,
} from './angus-shield-link';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
const REFRESH_DAYS = 60;
const TIMEOUT_MS = 15_000;
const nowIso = () => new Date().toISOString();

let fetcher: Fetch = (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(TIMEOUT_MS) });
/** Tests stand in for Angus Shield here. */
export function setAngusFetch(f: Fetch | null) { fetcher = f ?? ((u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(TIMEOUT_MS) })); }

async function post(url: string, body: string, headers: Record<string, string>) {
  const r = await fetcher(url, { method: 'POST', headers, body });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* an empty answer */ }
  return { ok: r.ok, status: r.status, json };
}

// ── The credential ─────────────────────────────────────────────────────────────────────────────

async function credentialRow(tenantId: string, connectionId?: string) {
  const rows = await db.select({ c: schema.connectionCredentials, status: schema.systemConnections.status, connectionId: schema.systemConnections.id })
    .from(schema.connectionCredentials)
    .innerJoin(schema.systemConnections, eq(schema.systemConnections.id, schema.connectionCredentials.connectionId))
    .where(and(
      eq(schema.connectionCredentials.tenantId, tenantId),
      eq(schema.connectionCredentials.provider, PROVIDER),
      eq(schema.systemConnections.tenantId, tenantId),
      isNull(schema.systemConnections.personalFor),
      ...(connectionId ? [eq(schema.systemConnections.id, connectionId)] : []),
    ));
  return rows[0] ?? null;
}

/** Code for tokens (PKCE), then the credential written sealed and the connection marked live. */
export async function completeAngus(opts: { tenantId: string; connectionId: string; code: string; verifier: string; app?: AngusApp | null }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const app = opts.app ?? angusApp();
  if (!app) return { ok: false, reason: 'The Angus Shield connection is not set up on this deployment yet.' };
  const r = await post(`${app.base}/api/oauth/token`, codeBody(app, opts.code, opts.verifier), { 'Content-Type': 'application/x-www-form-urlencoded' });
  const tokens = r.ok ? parseTokens(r.json) : null;
  if (!tokens) return { ok: false, reason: 'Angus Shield did not accept that sign-in. Try connecting again.' };
  if (!tokens.signingSecret) return { ok: false, reason: 'Angus Shield did not send the connection’s signing secret. Disconnect it there, then connect again.' };
  await storeAngus(opts.tenantId, opts.connectionId, tokens);
  await db.update(schema.systemConnections).set({ status: 'live', lastErrorAt: null })
    .where(and(eq(schema.systemConnections.id, opts.connectionId), eq(schema.systemConnections.tenantId, opts.tenantId)));
  // Where Angus Shield sends its events (§3). A failure here is retried on the next connect.
  await registerWebhook(opts.tenantId, app, tokens.accessToken).catch(() => undefined);
  return { ok: true };
}

async function storeAngus(tenantId: string, connectionId: string, t: AngusTokens) {
  const now = new Date();
  const values = {
    provider: PROVIDER, refreshTokenSealed: seal(t.refreshToken), remoteId: t.angusId,
    ...(t.signingSecret ? { signingSecretSealed: seal(t.signingSecret) } : {}),
    scope: 'sitevip.v1', expiresAt: new Date(now.getTime() + REFRESH_DAYS * 86_400_000).toISOString(), updatedAt: now.toISOString(),
    xeroOrgId: null, orgName: null, orgChoices: null,
  };
  const [existing] = await db.select({ id: schema.connectionCredentials.id }).from(schema.connectionCredentials)
    .where(and(eq(schema.connectionCredentials.tenantId, tenantId), eq(schema.connectionCredentials.connectionId, connectionId)));
  if (existing) await db.update(schema.connectionCredentials).set(values).where(eq(schema.connectionCredentials.id, existing.id));
  else await db.insert(schema.connectionCredentials).values({ id: randomUUID(), tenantId, connectionId, createdAt: now.toISOString(), ...values, refreshTokenSealed: values.refreshTokenSealed });
}

const cached = new Map<string, { token: string; until: number }>();

/**
 * A current access token. Refresh tokens work once (§1), so the refresh is done holding a row lock:
 * two requests at the same moment must never both spend the same refresh token, or Angus Shield
 * stops the whole connection as a copied key.
 */
export async function angusAccessToken(tenantId: string, app: AngusApp): Promise<string | null> {
  const row = await credentialRow(tenantId);
  if (!row || row.status !== 'live') return null;
  const hit = cached.get(row.c.id);
  if (hit && hit.until > Date.now()) return hit.token;
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.connectionCredentials).where(eq(schema.connectionCredentials.id, row.c.id)).for('update');
    if (!c) return null;
    const again = cached.get(c.id);
    if (again && again.until > Date.now()) return again.token;
    const r = await post(`${app.base}/api/oauth/token`, refreshBody(app, open(c.refreshTokenSealed)), { 'Content-Type': 'application/x-www-form-urlencoded' });
    const t = r.ok ? parseTokens(r.json) : null;
    if (!t) {
      await tx.update(schema.systemConnections).set({ status: 'broken', lastErrorAt: nowIso() }).where(eq(schema.systemConnections.id, row.connectionId));
      return null;
    }
    await tx.update(schema.connectionCredentials).set({ refreshTokenSealed: seal(t.refreshToken), updatedAt: nowIso() }).where(eq(schema.connectionCredentials.id, c.id));
    cached.set(c.id, { token: t.accessToken, until: Date.now() + Math.max(60, t.expiresIn - 60) * 1000 });
    return t.accessToken;
  });
}

async function registerWebhook(tenantId: string, app: AngusApp, accessToken?: string) {
  const token = accessToken ?? await angusAccessToken(tenantId, app);
  if (!token) return;
  const appUrl = app.redirectUri.replace(/\/connections\/angus-shield\/callback$/, '');
  await post(`${app.base}/api/v1/webhook`, JSON.stringify({ url: `${appUrl}/api/angus-shield/events` }), { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
}

/** True when this business holds a live Angus Shield connection (the seamless path). */
export async function angusLive(tenantId: string): Promise<boolean> {
  const row = await credentialRow(tenantId);
  return !!row && row.status === 'live' && !!row.c.signingSecretSealed && !!row.c.remoteId;
}

// ── Events out ─────────────────────────────────────────────────────────────────────────────────

/**
 * Queues an event for Angus Shield when the business is connected; does nothing otherwise (manual
 * is a complete, permanent mode). Returns whether it was queued.
 */
export async function emitToAngus(tenantId: string, type: string, data: unknown, occurredAt?: Date): Promise<boolean> {
  const row = await credentialRow(tenantId);
  if (!row || row.status !== 'live' || !row.c.remoteId || !row.c.signingSecretSealed) return false;
  const at = (occurredAt ?? new Date()).toISOString();
  await db.insert(schema.connectionOutbox).values({
    id: randomUUID(), tenantId, connectionId: row.connectionId, eventId: randomUUID(), type, payload: JSON.stringify(data),
    occurredAt: at, attempts: 0, nextAttemptAt: at,
  });
  return true;
}

/** Sends what's due. Called straight after a change (within the minute) and by the five-minute schedule. */
export async function deliverAngus(opts: { tenantId?: string; limit?: number; now?: Date } = {}): Promise<{ sent: number; failed: number; gaveUp: number }> {
  const app = angusApp();
  const out = { sent: 0, failed: 0, gaveUp: 0 };
  if (!app) return out;
  const now = opts.now ?? new Date();
  const due = await db.select().from(schema.connectionOutbox)
    .where(and(isNull(schema.connectionOutbox.deliveredAt), isNull(schema.connectionOutbox.gaveUpAt), lte(schema.connectionOutbox.nextAttemptAt, now.toISOString()),
      ...(opts.tenantId ? [eq(schema.connectionOutbox.tenantId, opts.tenantId)] : [])))
    .orderBy(schema.connectionOutbox.occurredAt).limit(opts.limit ?? 100);
  for (const e of due) {
    // Claimed first, so two senders at once never both send the same event.
    const claimed = await db.update(schema.connectionOutbox).set({ nextAttemptAt: new Date(now.getTime() + 120_000).toISOString() })
      .where(and(eq(schema.connectionOutbox.id, e.id), eq(schema.connectionOutbox.nextAttemptAt, e.nextAttemptAt), isNull(schema.connectionOutbox.deliveredAt)))
      .returning({ id: schema.connectionOutbox.id });
    if (!claimed.length) continue;
    const row = await credentialRow(e.tenantId, e.connectionId);
    if (!row || row.status !== 'live' || !row.c.signingSecretSealed || !row.c.remoteId) {
      await db.update(schema.connectionOutbox).set({ gaveUpAt: now.toISOString(), lastError: 'Not connected any more' }).where(eq(schema.connectionOutbox.id, e.id));
      out.gaveUp++; continue;
    }
    const body = JSON.stringify(envelope(e.type, JSON.parse(e.payload), { sitevip: e.tenantId, angus: row.c.remoteId }, e.eventId, e.occurredAt));
    let error: string | null = null;
    let answer: unknown = null;
    try {
      const r = await post(`${app.base}/api/sitevip/v1/events`, body, { 'Content-Type': 'application/json', 'X-SiteVIP-Signature': signatureHeader(open(row.c.signingSecretSealed), body, now.getTime()) });
      answer = r.json;
      if (!r.ok) error = (r.json as { reason?: string } | null)?.reason ?? `Angus Shield said ${r.status}`;
    } catch (x) { error = (x as Error).message.slice(0, 200); }
    if (!error) {
      await db.update(schema.connectionOutbox).set({ deliveredAt: now.toISOString(), attempts: e.attempts + 1, lastError: null }).where(eq(schema.connectionOutbox.id, e.id));
      await db.update(schema.systemConnections).set({ lastSyncAt: now.toISOString(), lastErrorAt: null }).where(eq(schema.systemConnections.id, e.connectionId));
      // An invoice request answers with Angus Shield's own invoice number: shown on the job bill.
      const invoice = (answer as { invoice?: unknown } | null)?.invoice;
      if (e.type === 'invoice.requested' && typeof invoice === 'string') {
        const billId = (JSON.parse(e.payload) as { sitevip_id?: string }).sitevip_id;
        if (billId) await db.update(schema.jobBills).set({ invoiceNumber: invoice, updatedAt: now.toISOString() }).where(and(eq(schema.jobBills.id, billId), eq(schema.jobBills.tenantId, e.tenantId)));
      }
      out.sent++; continue;
    }
    const attempts = e.attempts + 1;
    const next = nextAttempt(attempts, Date.parse(e.occurredAt), now.getTime());
    if (next === null) {
      await db.update(schema.connectionOutbox).set({ attempts, gaveUpAt: now.toISOString(), lastError: error }).where(eq(schema.connectionOutbox.id, e.id));
      await db.update(schema.systemConnections).set({ lastErrorAt: now.toISOString() }).where(eq(schema.systemConnections.id, e.connectionId));
      out.gaveUp++;
    } else {
      await db.update(schema.connectionOutbox).set({ attempts, nextAttemptAt: new Date(next).toISOString(), lastError: error }).where(eq(schema.connectionOutbox.id, e.id));
      out.failed++;
    }
  }
  return out;
}

// ── Events in ──────────────────────────────────────────────────────────────────────────────────

export interface Received { status: number; body: Record<string, unknown> }
const refuse = (status: number, error: string, reason: string, fix: string): Received => ({ status, body: { error, reason, fix } });

/** Angus Shield's events (§3): signed with the connection's secret, applied once, never half-applied. */
export async function receiveFromAngus(raw: string, signature: string | null, nowMs = Date.now()): Promise<Received> {
  let env: { contract?: string; event_id?: string; type?: string; occurred_at?: string; tenant?: { angus_id?: string; sitevip_id?: string }; data?: Record<string, unknown> };
  try { env = JSON.parse(raw); } catch { return refuse(400, 'not_json', 'The event isn’t JSON.', 'Send the contract envelope.'); }
  if (!String(env.contract ?? '').startsWith('1.')) return refuse(422, 'contract_version', 'SiteVIP speaks contract 1.x.', 'Check GET /v1/contract.');
  const angusId = env.tenant?.angus_id;
  if (!angusId || !env.event_id || !env.type || !env.occurred_at) return refuse(400, 'envelope', 'The envelope is missing event_id, type, occurred_at or tenant.angus_id.', 'Send the full contract envelope.');
  const [c] = await db.select().from(schema.connectionCredentials)
    .where(and(eq(schema.connectionCredentials.provider, PROVIDER), eq(schema.connectionCredentials.remoteId, angusId)));
  if (!c?.signingSecretSealed) return refuse(401, 'not_connected', 'No SiteVIP business is connected to that Angus Shield business.', 'Connect from SiteVIP (one yes).');
  if (!signatureOk(open(c.signingSecretSealed), signature, raw, nowMs)) return refuse(401, 'bad_signature', 'The signature doesn’t match, or the event is more than 5 minutes old.', 'Sign with the connection’s secret and send it straight away.');
  const tenantId = c.tenantId;
  const fresh = await db.insert(schema.connectionInbox).values({ id: randomUUID(), tenantId, eventId: env.event_id, type: env.type, occurredAt: env.occurred_at, receivedAt: new Date(nowMs).toISOString() })
    .onConflictDoNothing().returning({ id: schema.connectionInbox.id });
  if (!fresh.length) return { status: 200, body: { ok: true, repeat: true } };
  const result = await applyEvent(tenantId, env.type, env.data ?? {}, env.occurred_at);
  await db.update(schema.connectionInbox).set({ result: result.body.ok ? 'applied' : String(result.body.error) }).where(eq(schema.connectionInbox.id, fresh[0]!.id));
  await db.update(schema.systemConnections).set({ lastSyncAt: new Date(nowMs).toISOString() }).where(eq(schema.systemConnections.id, c.connectionId));
  return result;
}

async function jobsByRefs(tenantId: string, refs: string[]) {
  if (!refs.length) return [];
  return db.select().from(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.ref, refs)));
}

async function applyEvent(tenantId: string, type: string, d: Record<string, unknown>, occurredAt: string): Promise<Received> {
  const ok = (extra: Record<string, unknown> = {}): Received => ({ status: 200, body: { ok: true, ...extra } });
  const at = new Date().toISOString();
  if (type === 'invoice.created' || type === 'invoice.part_paid' || type === 'invoice.paid' || type === 'invoice.overdue') {
    const number = typeof d.number === 'string' ? d.number : null;
    if (!number) return refuse(422, 'invoice', 'The invoice needs its number.', 'Send data.number.');
    if (type === 'invoice.overdue' && typeof d.days_overdue === 'number') {
      await db.update(schema.jobBills).set({ overdueDays: d.days_overdue, updatedAt: at }).where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.invoiceNumber, number)));
    }
    if (type === 'invoice.paid') {
      await db.update(schema.jobBills).set({ state: 'paid', paidAt: typeof d.paid_on === 'string' ? d.paid_on : at, overdueDays: null, updatedAt: at })
        .where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.invoiceNumber, number)));
      // A job whose bills are all paid moves to paid (§3). SiteVIP is master of the stage; this is the one move the contract gives the money side.
      const refs = Array.isArray(d.job_refs) ? d.job_refs.filter((x): x is string => typeof x === 'string') : [];
      for (const j of await jobsByRefs(tenantId, refs)) {
        if (j.stage !== 'invoiced') continue;
        const bills = await db.select({ state: schema.jobBills.state }).from(schema.jobBills).where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.jobId, j.id)));
        if (bills.every(b => b.state === 'paid' || b.state === 'declined')) await db.update(schema.jobs).set({ stage: 'paid', stageAt: at }).where(eq(schema.jobs.id, j.id));
      }
    }
    return ok();
  }
  if (type === 'job.profit_updated' || type === 'job.costs_updated') {
    const job = (d.job ?? {}) as { sitevip_id?: string; ref?: string };
    const [j] = job.sitevip_id
      ? await db.select().from(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.id, job.sitevip_id)))
      : await jobsByRefs(tenantId, job.ref ? [job.ref] : []);
    if (!j) return ok({ ignored: 'job not in SiteVIP' });
    const n = (k: string) => (Number.isSafeInteger(d[k]) ? (d[k] as number) : 0);
    const cost = ['labour_cost_cents', 'materials_cents', 'subcontractor_cents', 'plant_cents', 'other_cents'].reduce((a, k) => a + n(k), 0);
    const asAt = typeof d.as_at === 'string' ? d.as_at : occurredAt;
    const values = { invoicedCents: n('invoiced_cents'), receivedCents: n('received_cents'), costCents: cost, profitCents: n('profit_cents'), marginPct: d.margin_pct === null || d.margin_pct === undefined ? null : String(d.margin_pct), asAt, updatedAt: at };
    const [have] = await db.select().from(schema.jobBookFigures).where(and(eq(schema.jobBookFigures.tenantId, tenantId), eq(schema.jobBookFigures.jobId, j.id)));
    if (!have) await db.insert(schema.jobBookFigures).values({ id: randomUUID(), tenantId, jobId: j.id, ...values });
    else if (have.asAt <= asAt) await db.update(schema.jobBookFigures).set(values).where(eq(schema.jobBookFigures.id, have.id)); // the newer one wins
    return ok();
  }
  // Minor versions add event types; a receiver ignores what it doesn't know yet (§7).
  return ok({ ignored: type });
}

// ── What SiteVIP sends, from the moments it happens ────────────────────────────────────────────

/** Approved timesheet entries → `hours.approved` (contract §3). Called in the same change as the approval. */
export async function emitHoursApproved(tenantId: string, ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  const rows = await db.select().from(schema.timesheetEntries)
    .where(and(eq(schema.timesheetEntries.tenantId, tenantId), inArray(schema.timesheetEntries.id, ids)));
  const jobIds = [...new Set(rows.map(r => r.jobId).filter((x): x is string => !!x))];
  const jobs = jobIds.length ? await db.select({ id: schema.jobs.id, ref: schema.jobs.ref }).from(schema.jobs)
    .where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.id, jobIds))) : [];
  const refOf = new Map(jobs.map(j => [j.id, j.ref]));
  return emitToAngus(tenantId, 'hours.approved', hoursData(rows.map(r => ({
    id: r.id, personKey: r.personKey, personName: r.personName, day: r.day, minutes: r.minutes, billable: r.billable,
    allowances: typeof r.allowances === 'string' ? r.allowances : Array.isArray(r.allowances) ? (r.allowances as string[]).join(';') : null,
    jobRef: r.jobId ? refOf.get(r.jobId) ?? null : null, approvedBy: r.approvedBy, approvedAt: r.approvedAt,
  }))));
}

async function customerOf(tenantId: string, job: { organisationId?: string | null; personId?: string | null; client: string }) {
  if (job.personId) {
    const [p] = await db.select().from(schema.crmPeople).where(and(eq(schema.crmPeople.tenantId, tenantId), eq(schema.crmPeople.id, job.personId)));
    if (p) {
      const [o] = job.organisationId ? await db.select().from(schema.crmOrganisations).where(and(eq(schema.crmOrganisations.tenantId, tenantId), eq(schema.crmOrganisations.id, job.organisationId))) : [];
      return { name: o?.name ?? p.name, email: p.email ?? null, phone: p.phone ?? o?.phone ?? null };
    }
  }
  if (job.organisationId) {
    const [o] = await db.select().from(schema.crmOrganisations).where(and(eq(schema.crmOrganisations.tenantId, tenantId), eq(schema.crmOrganisations.id, job.organisationId)));
    if (o) return { name: o.name, email: null, phone: o.phone ?? null };
  }
  return { name: job.client, email: null, phone: null };
}

/** A job moved a stage → job.won / job.completed / job.quoted / job.stage_changed, with its full state. */
export async function emitJobStage(tenantId: string, jobId: string, from: string): Promise<boolean> {
  const [j] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.id, jobId)));
  if (!j) return false;
  return emitToAngus(tenantId, stageEvent(from, j.stage), jobData(j, await customerOf(tenantId, j)));
}

/** A bill agreed (a variation) or marked to send → invoice.requested. Angus Shield makes its own invoice and answers with its number. */
export async function emitInvoiceRequest(tenantId: string, billId: string): Promise<boolean> {
  const [b] = await db.select().from(schema.jobBills).where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.id, billId)));
  if (!b || b.invoiceNumber) return false;
  const [j] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.id, b.jobId)));
  if (!j) return false;
  const customer = await customerOf(tenantId, j);
  // The job first, so Angus Shield has it to put the invoice on (a repeat of job.won is harmless: full state, newest wins).
  const t = Date.now();
  await emitToAngus(tenantId, 'job.won', jobData(j, customer), new Date(t));
  return emitToAngus(tenantId, 'invoice.requested', invoiceRequestData(b, j, customer), new Date(t + 1));
}

/** Sends straight after the response has gone (within the minute, §3), never during a page render. */
export function sendSoon(tenantId: string): void {
  try {
    after(async () => { try { await deliverAngus({ tenantId, limit: 50 }); } catch (e) { console.error('[angus-shield] send', (e as Error).message); } });
  } catch { /* outside a request: the five-minute schedule sends it */ }
}
