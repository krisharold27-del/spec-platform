import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { coverageFor, connectionsFor } from '@/lib/coverage-data';
import { CoverageMap } from './coverage-map';

export const dynamic = 'force-dynamic';

/**
 * Everything SPEC does — `SPEC Coverage.dc.html`, 23 September.
 *
 * Thirty-eight capabilities across Jobs, HR and Safety, each with a switch: run it in SPEC, or keep
 * the system the business already has — and one switch per area for the simple answer.
 *
 * ── Where the choice is kept ────────────────────────────────────────────────────────────────────
 *
 * Per business, in `coverage_choices` (one row per capability changed from SPEC). Everything starts
 * in SPEC; a manager changes it — the same gate as Jobs and Safety writes — and everybody else sees
 * it read-only. The choice is read by Jobs, Safety, People, the CRM and the Power Meter's source
 * labels; the SPEC screens keep working either way. Kris, 23 September: "they must have options and
 * simplicity".
 */
export default async function Coverage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const [choices, connections] = await Promise.all([coverageFor(user.tenantId), connectionsFor(user.tenantId)]);

  return (
    <Shell
      title="Coverage"
      kicker={`Everything SPEC does · ${tenant.name}`}
      headline="One system, or as many as you like."
      subtitle="Every part of running a trade business, and what it replaces. For each one, run it in SPEC or keep the system you already have. Either way you work from one screen."
    >
      <CoverageMap choices={choices} connections={connections} canChange={canManage(user.access)} />
      <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-ink-light">
        Accounting stays in your accounting system, because your accountant, the bank and the tax office
        all work there. SPEC sends it the invoices, bills and pay runs, so nobody types them twice.
      </p>
    </Shell>
  );
}
