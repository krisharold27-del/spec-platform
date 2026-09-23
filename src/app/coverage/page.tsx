import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { defaultChoices } from '@/lib/coverage';
import { CoverageMap } from './coverage-map';

export const dynamic = 'force-dynamic';

/**
 * Everything SPEC does — `SPEC Coverage.dc.html`, 23 September.
 *
 * Thirty-eight capabilities across Jobs, HR and Safety, each with a switch: run it in SPEC, or keep
 * the system the business already has. The list lives in `lib/coverage`; the starting position of
 * every switch is read from the connections the business has already made, so nothing is asked
 * twice.
 *
 * ── Where the choice is kept, stated ────────────────────────────────────────────────────────────
 *
 * The business has no settings store to keep it in — `tenants` carries named columns, not a
 * settings blob, and no table holds per-capability choices. Rather than add one alongside the work
 * adding Jobs and Safety tables, the switch is remembered in this browser only, per business, and
 * the page says so. It changes nothing else in SPEC yet: which system runs a capability is a
 * statement of intent until the capability reads from it.
 */
export default async function Coverage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;

  // The business's own connections, never a person's mailbox — the same rule Connections keeps.
  const connections = await db.select({ category: schema.systemConnections.category })
    .from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));

  return (
    <Shell
      title="Coverage"
      kicker={`Everything SPEC does · ${tenant.name}`}
      headline="One system, or as many as you like."
      subtitle="Every part of running a trade business, and what it replaces. For each one, run it in SPEC or keep the system you already have. Either way you work from one screen."
    >
      <CoverageMap
        tenantId={tenant.id}
        defaults={defaultChoices(connections.map(c => c.category))}
      />
      <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-ink-light">
        Accounting stays in your accounting system, because your accountant, the bank and the tax office
        all work there. SPEC sends it the invoices, bills and pay runs, so nobody types them twice.
      </p>
    </Shell>
  );
}
