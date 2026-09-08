import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { Interview, type Step, type NextStep } from '@/components/interview';
import { journeyFor } from '@/lib/journey';
import { doseFor, DOSES, type Dose } from '@/lib/doses';
import diagnostic from '../../../../seed/diagnostic.json';

export const dynamic = 'force-dynamic';

type Q = { id: string; text: string; type?: string; options?: string[] };
type Section = {
  id: string; title: string; when: string; intro?: string; type?: string;
  questions?: Q[]; items?: string[]; scale?: string[]; text?: string;
};

/** Flatten one dose of the diagnostic into an ordered run of questions. */
export function stepsForDose(sections: Section[], dose: Dose): Step[] {
  const steps: Step[] = [];
  const wanted = (id: string) =>
    (!dose.only || dose.only.includes(id)) && (!dose.except || !dose.except.includes(id));

  for (const s of sections) {
    if (!dose.sections.includes(s.id)) continue;

    for (const q of s.questions ?? []) {
      if (!wanted(q.id)) continue;
      steps.push({
        sectionId: s.id, questionId: q.id, sectionTitle: s.title, intro: s.intro,
        text: q.text,
        kind: q.type === 'choice' ? 'choice' : 'text',
        options: q.options,
      });
    }

    if (dose.includeRatings && s.type === 'rating' && s.items) {
      s.items.forEach((item, idx) => {
        steps.push({
          sectionId: s.id, questionId: `item${idx}`, sectionTitle: s.title, intro: s.intro,
          text: `How well is this understood — ${item}?`,
          kind: 'rating', options: s.scale ?? [],
        });
      });
    }

    if (dose.includeAgreement && s.type === 'agreement' && s.text) {
      steps.push({
        sectionId: s.id, questionId: 'accepted', sectionTitle: s.title, intro: s.intro,
        text: 'Do you agree to work this way, on behalf of the business?',
        kind: 'agreement', agreementText: s.text,
      });
    }
  }
  return steps;
}

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
