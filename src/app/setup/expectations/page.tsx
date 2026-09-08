import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { Interview, type NextStep } from '@/components/interview';
import { journeyFor } from '@/lib/journey';
import { doseFor, DOSES } from '@/lib/doses';
import { stepsForDose, type Section } from '@/lib/interview-steps';
import diagnostic from '../../../../seed/diagnostic.json';

export const dynamic = 'force-dynamic';

export default async function Expectations({ searchParams }: { searchParams: Promise<{ dose?: string; all?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const showAll = sp.all === '1';
  const dose = doseFor(sp.dose);

  const rows = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId));
  const initial: Record<string, string> = {};
  for (const r of rows) if (r.answer) initial[`${r.sectionId}:${r.questionId}`] = r.answer;

  const sections = diagnostic.sections as Section[];
  const steps = showAll
    ? Object.values(DOSES).flatMap(d => stepsForDose(sections, d))
    : stepsForDose(sections, dose);

  // Hand over to the real next step of the journey rather than stopping on a summary.
  const journey = await journeyFor(user.tenantId);
  const upcoming = journey.find(j => j.status !== 'done' && j.href.split('?')[0] !== '/setup/expectations');
  const nextStep: NextStep = upcoming ? { title: upcoming.title, href: upcoming.href, why: upcoming.why } : null;

  return (
    <Shell
      title={showAll ? 'The whole diagnostic' : dose.title}
      subtitle={showAll ? 'Every question, in one run.' : dose.why}
    >
      <Interview steps={steps} initial={initial} nextStep={nextStep} />
      {!showAll && dose.id === 'core' && (
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-ink-light/70">
          The rest of the diagnostic is asked at the step that uses it — the cost base with the gross profit target,
          confidence and client sentiment with the KPIs.{' '}
          <Link href="/setup/expectations?all=1" className="underline hover:text-rust">Answer everything now instead</Link>
        </p>
      )}
    </Shell>
  );
}
