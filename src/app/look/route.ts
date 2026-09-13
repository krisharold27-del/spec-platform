import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { beginLook, currentLook } from '@/lib/look';
import { createThrottle } from '@/lib/throttle';
import { answerFor, type Status } from '@/lib/status';

/**
 * "Have a look inside" — a real business, built on the spot, with nobody asked for anything.
 *
 * You do not pay for a house before seeing inside it. This creates an actual tenant with an org
 * chart, the four questions and a month part-marked, hands the browser a token for it, and drops
 * the visitor straight onto the chart. Signing up later KEEPS it.
 *
 * A GET that writes is normally wrong, and it is deliberate here: this has to be reachable by
 * pressing a link on the front door, and there is nothing to protect — no account, no data of
 * anybody's, and the thing it creates is read-only until somebody claims it.
 */

// One look per browser is already handled by the cookie; this is for something hammering the link.
const looksByAddress = createThrottle(60 * 60_000, 10_000, 5);

/**
 * Enough marked for the chart to have colour in it and for the four questions to mean something,
 * with one pillar deliberately behind — a demo where everything is green teaches nobody anything,
 * and the whole product is about the thing that is not going well.
 */
const MARKS: Record<string, Status[]> = {
  gm: ['met', 'met', 'met', 'not_met', 'met', 'met', 'met', 'met'],
  commercial_manager: ['met', 'met', 'met', 'not_met', 'met', 'watch', 'met', 'met'],
  operations_manager: ['met', 'met', 'not_met', 'not_met', 'met', 'met', 'met', 'met'],
  growth_manager: ['met', 'met', 'met', 'not_met', 'met', 'met', 'met', 'pending'],
};

const PEOPLE: Record<string, string> = {
  gm: 'You',
  commercial_manager: 'Sam Lee',
  operations_manager: 'Jo Barnes',
  growth_manager: 'Chris Nguyen',
};

export async function GET(request: NextRequest) {
  // Already looking around? Put them back where they were rather than building a second one.
  if (await currentLook()) return NextResponse.redirect(new URL('/org?look=1', request.url));

  const ip =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (!looksByAddress.allow(ip)) {
    return NextResponse.redirect(new URL('/?busy=1', request.url));
  }

  const { tenantId, roleIds } = await provisionTenant({
    name: 'An example business',
    roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'],
  });

  for (const [template, name] of Object.entries(PEOPLE)) {
    const roleId = roleIds[template];
    if (roleId) await assignPerson(tenantId, roleId, { name, email: `${template}@example.invalid` });
  }

  // A month with something in it, so the chart and the four questions are worth looking at.
  const [period] = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  if (period) {
    for (const [template, statuses] of Object.entries(MARKS)) {
      const roleId = roleIds[template];
      if (!roleId || !statuses.length) continue;
      const criteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleId));
      const rows = criteria
        .map((c, i) => ({ c, status: statuses[i] }))
        .filter(x => x.status)
        .map(({ c, status }) => ({
          id: crypto.randomUUID(),
          periodId: period.id,
          roleId,
          criterionId: c.id,
          answer: answerFor(status),
          status,
          source: 'Marked for this look around',
          enteredBy: 'example',
          enteredAt: new Date().toISOString(),
        }));
      if (rows.length) await db.insert(schema.assessments).values(rows);
    }
  }

  await beginLook(tenantId);
  return NextResponse.redirect(new URL('/org?look=1', request.url));
}
