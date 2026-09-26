import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { getScope } from './scope';
import { currentPeriod } from './period';
import { getScorecard } from './queries';
import { isScored } from './today-data';
import { clearAcross } from './clear-to-work-data';
import { nextRef, type StageKey } from './jobs';
import { matchClient, namedClient } from './clients';

/**
 * The crew — the people a job can be booked with — and whether each of them is clear to work.
 *
 * ── One gate, one meaning ────────────────────────────────────────────────────────────────────────
 *
 * Clear to Work is worked out here by exactly the path the People screen uses: a compliance KPI
 * marked not met, an expired or missing ticket held against the person or their role, an overdue
 * training module. Then `clearToWork` in lib/people turns that into clear, not clear, or not
 * established. The schedule refuses anybody who is not clear, so the two screens can never disagree
 * about whether somebody may be sent to site.
 *
 * Only the part of the chart this person can see: a leader books their own crew, and a technician
 * sees themselves. Board roles are not crew.
 */
export interface CrewMember {
  /** `staff:<id>` or `user:<id>` — the key bookings and timesheets are held against. */
  key: string;
  name: string;
  roleTitle: string;
  clear: 'clear' | 'blocked' | 'unknown';
  label: string;
  /** Why, in the person's own terms, when they are not clear. */
  reason: string;
}

export async function crewFor(user: CurrentUser): Promise<CrewMember[]> {
  const scope = await getScope(user);
  const visible = scope.roles.filter(r => scope.canSee(r.id) && r.stream !== 'board');
  const roleIds = visible.map(r => r.id);
  if (!roleIds.length) return [];

  /*
    One loader, since 26 September. This function used to assemble the gate's facts itself — the
    fourth place in the product that did — and the month-ahead schedule made a fifth reading that
    disagreed with all of them. The rules never moved; only the loading was pulled into one place,
    so the crew picker and the schedule cannot now say different things about the same person.
  */
  const facts = await clearAcross(user.tenantId, { roleIds, now: new Date() });

  return facts
    .filter(f => f.roleId !== null)
    .map(f => ({
      key: f.key, name: f.name, roleTitle: f.roleTitle,
      clear: f.state, label: f.label, reason: f.reason,
    }));
}

/** The business's standard labour cost rate — its first labour rate — or null when it has none. */
export async function standardRate(tenantId: string) {
  const rates = await db.select().from(schema.labourRates)
    .where(eq(schema.labourRates.tenantId, tenantId))
    .orderBy(schema.labourRates.position, schema.labourRates.createdAt);
  return rates[0] ?? null;
}

/**
 * The one way a job comes into being.
 *
 * An enquiry typed on the Jobs screen starts here at `enquiry`; a deal won in the CRM starts here at
 * `won`, carrying its client, site and value, because the selling is already done; a job started
 * from a client on /clients starts here too, already knowing who it is for. Either way the reference
 * comes from the same series, so the routes can never hand out the same J-number.
 *
 * ── Every job's client is on the client list (23 September) ─────────────────────────────────────
 *
 * A job arriving with its client already known (from the CRM, or /clients) keeps that link. One
 * typed with only a name is linked to the client of that exact name if the business has one — and
 * if it has none, the organisation is made, so the next job for them links on its own and the
 * client list is the whole list. `client` stays the words typed; the link is beside it. A job with
 * no client given ("New client") is left unlinked rather than filed under a made-up name.
 */
export async function createJob(input: {
  tenantId: string;
  stage: StageKey;
  title: string;
  client: string;
  site: string;
  valueCents?: number;
  createdBy: string;
  organisationId?: string | null;
  personId?: string | null;
}): Promise<{ id: string; ref: string }> {
  let organisationId = input.organisationId ?? null;
  let personId = input.personId ?? null;
  if (!organisationId && !personId && namedClient(input.client)) {
    const [orgs, people] = await Promise.all([
      db.select({ id: schema.crmOrganisations.id, name: schema.crmOrganisations.name })
        .from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, input.tenantId)),
      db.select({ id: schema.crmPeople.id, name: schema.crmPeople.name, organisationId: schema.crmPeople.organisationId })
        .from(schema.crmPeople).where(eq(schema.crmPeople.tenantId, input.tenantId)),
    ]);
    const found = matchClient(input.client, orgs, people);
    if (found) {
      organisationId = found.organisationId;
      personId = found.personId;
    } else {
      organisationId = randomUUID();
      await db.insert(schema.crmOrganisations).values({
        id: organisationId, tenantId: input.tenantId, name: input.client.trim().slice(0, 160),
        createdBy: input.createdBy, createdAt: new Date().toISOString(),
      });
    }
  }

  const refs = await db.select({ ref: schema.jobs.ref }).from(schema.jobs).where(eq(schema.jobs.tenantId, input.tenantId));
  const id = randomUUID();
  const ref = nextRef('J', refs.map(r => r.ref));
  const at = new Date().toISOString();
  await db.insert(schema.jobs).values({
    id, tenantId: input.tenantId, ref, stage: input.stage, title: input.title, client: input.client,
    organisationId, personId,
    site: input.site, valueCents: input.valueCents ?? 0, createdBy: input.createdBy, createdAt: at, stageAt: at,
  });
  return { id, ref };
}
