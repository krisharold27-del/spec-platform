'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator } from '@/lib/scope';
import { assertWritable, planStateFor } from '@/lib/plan';
import { fileUnder, categoryName, isSensitive } from '@/lib/systems';
import { refuseTo } from '@/lib/refuse';
import { cookies } from 'next/headers';
import { authorizeUrl } from '@/lib/xero';
import { endpoints, xeroApp } from '@/lib/xero-net';
import { canHoldSecrets, seal } from '@/lib/secret-box';
import { ANGUS_STATE_COOKIE, angusApp, authorizeUrl as angusAuthorizeUrl, pkce } from '@/lib/angus-shield-link';
import { STATE_COOKIE, STATE_MINUTES, newState, packState, chooseOrg, forgetCredential } from '@/lib/xero-link';

/**
 * Connecting a system.
 *
 * Sensitive categories — anything carrying pay, personal records or the ledger — never connect on
 * a GM's say-so. They raise a request the board decides, with the exact data scope written on it,
 * because "the board felt they approved it" is not the same as the board approving it.
 */
async function administrator() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  assertAdministrator(await getScope(user));
  await assertWritable(user.tenantId);
  return user;
}

/**
 * No connector actually goes live without the AI layer switched on.
 *
 * Kris, 21 September: *"it must be blocked by payment - whats the point of letting people connect
 * xero when they haven't got AI connected"*. A business can still name every system it runs and
 * queue every board approval for free — that structure-building stays free like everything else in
 * `lib/plan`. What this stops is the moment SPEC would actually be handed a key: Going to Xero, and
 * marking any other connector live, both require `aiActive` — a real subscription, or one of the
 * two states SPEC switches fully on for free (`program`, `beta`).
 */
async function assertAiActive(tenantId: string) {
  const state = await planStateFor(tenantId);
  if (!state.aiActive) {
    refuseTo(
      '/connections',
      'A live connection needs the AI layer switched on, because a number with nobody reading across '
      + 'it is not worth the key SPEC would be holding. Start paying to switch it on, then come back '
      + 'and connect this.',
    );
  }
}

export async function connectSystem(formData: FormData) {
  const user = await administrator();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  /*
    Filed, not merely chosen. A name that says financials or payroll cannot be stored under a
    lighter category — see `fileUnder`. That was one dropdown between the board and the ledger.
  */
  const category = fileUnder(String(formData.get('category') ?? ''), name);
  const ownerName = String(formData.get('ownerName') ?? '').trim() || null;
  const ownerEmail = String(formData.get('ownerEmail') ?? '').trim() || null;

  const id = randomUUID();
  const sensitive = isSensitive(category);
  await db.insert(schema.systemConnections).values({
    id, tenantId: user.tenantId, name, category,
    ownerName, ownerEmail, ownerIsSelf: !ownerEmail,
    // A sensitive system sits disconnected until the board says otherwise. It is never connected
    // first and approved afterwards.
    status: 'requested',
    createdAt: new Date().toISOString(),
  });

  if (sensitive) {
    await db.insert(schema.approvals).values({
      id: randomUUID(), tenantId: user.tenantId, kind: 'connection',
      title: `${categoryName(category)} — ${name}`,
      detail: scopeFor(category),
      blocks: 'Blocks: the KPIs this system would feed stay manual, and anything it alone can measure stays not tracked.',
      decidedByLevel: 'board',
      requestedBy: user.name,
      requestedAt: new Date().toISOString(),
      refId: id,
    });
  }
  revalidatePath('/connections');
  revalidatePath('/inbox');
}

/** Exactly what the board is being asked to allow. Read only, always, and named in plain words. */
function scopeFor(category: string): string {
  switch (category) {
    case 'financials':
      return 'Invoices, gross profit and the profit and loss. Read only.';
    case 'payroll':
      return 'Personal records, pay, starters and leavers. Read only.';
    case 'safety':
      return 'Incidents, inductions and training records. Read only.';
    case 'crm':
      return 'Quotes, conversions and client records. Read only.';
    case 'job_management':
      return 'Jobs, timesheets and billable hours. Read only.';
    default:
      return 'Whatever this system holds that a KPI reads. Read only.';
  }
}

/** Disconnect. The KPIs it fed fall back to being confirmed by a person, which is a complete mode. */
export async function disconnectSystem(formData: FormData) {
  const user = await administrator();
  const id = String(formData.get('connectionId') ?? '');
  if (!id) return;
  // isNull(personalFor): an administrator runs the business's connections, not anybody's mailbox.
  // Without this, a well-meaning tidy-up of the connections list could disconnect a person's email.
  await db.update(schema.systemConnections)
    .set({ status: 'requested', lastSyncAt: null })
    .where(and(
      eq(schema.systemConnections.id, id),
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));
  /*
    And the credential goes with it.

    Disconnecting used to change a status and nothing else, which was harmless while nothing was
    ever stored. It is not harmless now: a sealed Xero refresh token left behind on a connection
    the business believes it has turned off is a live key to their accounts, sitting in a table
    nobody is looking at any more, for up to sixty days.

    The grant in Xero is theirs to revoke and SPEC cannot do it for them — so the screen says so.
  */
  await forgetCredential(user.tenantId, id);
  revalidatePath('/connections');
}

/**
 * Send an administrator to Xero to say yes.
 *
 * ── The board decision is checked HERE, not at the end ───────────────────────────────────────────
 *
 * Kris, 19 September: *"be very careful with connectors especially xero and financials - how are we
 * controlling this - not everyone should be able to connect Xero"*.
 *
 * `markLive` already refused to switch a sensitive system on without the board. That was the right
 * check in the wrong place the moment a real connector exists: once a customer completes consent,
 * **SPEC is holding a key to their accounts** — the access has happened, whatever any row says
 * afterwards. So the decision is checked before anybody is sent to Xero at all, and an unapproved
 * connection cannot start the flow.
 *
 * Every refusal here is a rule working, so every one of them is a `refuseTo` with a sentence
 * somebody can act on rather than a throw and the generic fault screen.
 */
export async function startXero(formData: FormData) {
  const user = await administrator();
  await assertAiActive(user.tenantId);
  const id = String(formData.get('connectionId') ?? '');
  if (!id) return;

  const [connection] = await db.select().from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.id, id),
      eq(schema.systemConnections.tenantId, user.tenantId),
      // A business connection, never somebody's mailbox — the guard `disconnectSystem` carries too.
      isNull(schema.systemConnections.personalFor),
    ));
  if (!connection) refuseTo('/connections', 'SPEC could not find that connection.');

  if (isSensitive(connection.category)) {
    const decisions = await db.select().from(schema.approvals)
      .where(and(eq(schema.approvals.tenantId, user.tenantId), eq(schema.approvals.refId, id)));
    if (!decisions.some(a => a.state === 'approved')) {
      refuseTo(
        '/connections',
        'The board has not approved this one yet. Linking Xero hands SPEC a key to the accounts, so it '
        + 'cannot happen before the decision — not even for an administrator.',
      );
    }
  }

  /*
    Asked BEFORE anybody is sent anywhere.

    Without it the customer signs in to Xero, consents, comes back — and SPEC throws while trying to
    seal a token it has already been handed. That is the worst possible moment to find out a
    deployment is unconfigured, and it leaves a live grant sitting in their Xero with nothing on
    this side holding it.
  */
  if (!canHoldSecrets()) {
    refuseTo('/connections', 'This deployment cannot hold credentials yet, so SPEC will not ask Xero for one.');
  }
  const app = xeroApp();
  if (!app) refuseTo('/connections', 'Xero is not set up on this deployment yet.');

  const link = newState(id);
  (await cookies()).set(STATE_COOKIE, packState(link), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MINUTES * 60,
  });

  redirect(authorizeUrl({
    clientId: app.clientId,
    redirectUri: app.redirectUri,
    state: link.state,
    authorize: endpoints().authorize,
  }));
}

/** Which set of books, when one Xero login reaches several. */
export async function chooseXeroOrg(formData: FormData) {
  const user = await administrator();
  const connectionId = String(formData.get('connectionId') ?? '');
  const xeroOrgId = String(formData.get('xeroOrgId') ?? '');
  if (!connectionId || !xeroOrgId) return;

  const chosen = await chooseOrg({ tenantId: user.tenantId, connectionId, xeroOrgId });
  if (!chosen.ok) refuseTo('/connections', chosen.reason);
  revalidatePath('/connections');
  redirect(`/connections?linked=${encodeURIComponent(chosen.name)}`);
}

/**
 * Mark a non-sensitive system live.
 *
 * Real credential exchange belongs to each connector; for Xero it is `startXero` above and the
 * callback route beside it. This is the step for everything SPEC has no connector for, which is
 * still almost everything — it says the business has done its side by hand.
 */
export async function markLive(formData: FormData) {
  const user = await administrator();
  await assertAiActive(user.tenantId);
  const id = String(formData.get('connectionId') ?? '');
  if (!id) return;

  const [connection] = await db.select().from(schema.systemConnections)
    .where(and(eq(schema.systemConnections.id, id), eq(schema.systemConnections.tenantId, user.tenantId)));
  if (!connection) return;

  if (isSensitive(connection.category)) {
    const approved = await db.select().from(schema.approvals)
      .where(and(eq(schema.approvals.tenantId, user.tenantId), eq(schema.approvals.refId, id)));
    if (!approved.some(a => a.state === 'approved')) {
      refuseTo('/connections', 'That category needs the board to approve it first.');
    }
  }

  /*
    `lastSyncAt` stays NULL, because nothing has been read.

    It used to be stamped with the moment somebody pressed this button, and My Page printed it as
    "last read <date>" — a date that meant "when a person clicked", presented as when a number
    arrived. The wording was torn out on 18 September; the write that produced it was not, so the
    column still held a plausible-looking lie waiting for the next screen to print.

    The first real connector is what sets this, when it has actually read something.
  */
  await db.update(schema.systemConnections)
    .set({ status: 'live' })
    .where(eq(schema.systemConnections.id, id));
  revalidatePath('/connections');
  revalidatePath('/my-page');
}

/*
 * ── Angus Shield (docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md §1) ─────────────────────────────────────
 *
 * The one yes. Angus Shield is a separate SPEC Business Solutions product (Kris, 25 September:
 * "Separate product, one connection through the contract"), connected by OAuth with PKCE. Same gates
 * as any financial system: an administrator, a writable plan, and the board's approval, because the
 * connection carries the business's money. The PKCE verifier and state travel sealed in a
 * fifteen-minute cookie, never in the address.
 */
export async function startAngusShield(formData: FormData) {
  const user = await administrator();
  const id = String(formData.get('connectionId') ?? '');
  if (!id) return;
  const [connection] = await db.select().from(schema.systemConnections)
    .where(and(eq(schema.systemConnections.id, id), eq(schema.systemConnections.tenantId, user.tenantId), isNull(schema.systemConnections.personalFor)));
  if (!connection) refuseTo('/connections', 'SPEC could not find that connection.');
  if (isSensitive(connection.category)) {
    const decisions = await db.select().from(schema.approvals)
      .where(and(eq(schema.approvals.tenantId, user.tenantId), eq(schema.approvals.refId, id)));
    if (!decisions.some(a => a.state === 'approved')) {
      refuseTo('/connections', 'The board has not approved this one yet. Connecting Angus Shield links the business’s money, so it cannot happen before the decision — not even for an administrator.');
    }
  }
  if (!canHoldSecrets()) refuseTo('/connections', 'This deployment cannot hold credentials yet, so SPEC will not ask Angus Shield for one.');
  const app = angusApp();
  if (!app) refuseTo('/connections', 'The Angus Shield connection is not set up on this deployment yet.');
  const { verifier, challenge } = pkce();
  const state = randomUUID();
  (await cookies()).set(ANGUS_STATE_COOKIE, seal(JSON.stringify({ state, verifier, connectionId: id, tenantId: user.tenantId, until: Date.now() + 15 * 60_000 })), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 15 * 60,
  });
  redirect(angusAuthorizeUrl(app, state, challenge));
}
