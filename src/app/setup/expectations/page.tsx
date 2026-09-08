import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { Interview, type Step, type NextStep } from '@/components/interview';
import { journeyFor } from '@/lib/journey';
import diagnostic from '../../../../seed/diagnostic.json';

export const dynamic = 'force-dynamic';

type Q = { id: string; text: string; type?: string; options?: string[]; gate?: boolean };
type Section = {
  id: string; title: string; when: string; intro?: string; type?: string;
  questions?: Q[]; items?: string[]; scale?: string[]; text?: string;
};

/**
 * Flatten the diagnostic into a single ordered run of questions for the interview.
 *
 * By default only the questions that actually gate the next step are asked. The rest are not
 * discarded — they are asked at the step that consumes them, so the leader never faces a wall of
 * homework before the system has done anything for them. `all` reopens the full set on request.
 */
function toSteps(sections: Section[], all: boolean): Step[] {
  const steps: Step[] = [];
  for (const s of sections) {
    for (const q of s.questions ?? []) {
      if (!all && !q.gate) continue;
      steps.push({
        sectionId: s.id, questionId: q.id, sectionTitle: s.title, intro: s.intro,
        text: q.text,
        kind: q.type === 'choice' ? 'choice' : 'text',
        options: q.options,
      });
    }
    if (all && s.type === 'rating' && s.items) {
      s.items.forEach((item, idx) => {
        steps.push({
          sectionId: s.id, questionId: `item${idx}`, sectionTitle: s.title, intro: s.intro,
          text: `How well is this understood — ${item}?`,
          kind: 'rating', options: s.scale ?? [],
        });
      });
    }
    if (all && s.type === 'agreement' && s.text) {
      steps.push({
        sectionId: s.id, questionId: 'accepted', sectionTitle: s.title, intro: s.intro,
        text: 'Do you agree to work this way, on behalf of the business?',
        kind: 'agreement', agreementText: s.text,
      });
    }
  }
  return steps;
}

export default async function Expectations({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const showAll = (await searchParams).all === '1';

  const rows = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId));
  const initial: Record<string, string> = {};
  for (const r of rows) if (r.answer) initial[`${r.sectionId}:${r.questionId}`] = r.answer;

  const sections = (diagnostic.sections as Section[]).filter(s => ['before_day_one', 'week_one'].includes(s.when));
  const steps = toSteps(sections, showAll);
  const remaining = toSteps(sections, true).length - steps.length;

  // What the leader is handed when the diagnostic is finished — the real next step of the journey,
  // not a dead end. The diagnostic's own steps are excluded: they are what was just completed.
  const journey = await journeyFor(user.tenantId);
  const upcoming = journey.find(j => j.status !== 'done' && j.id !== 'expectations' && j.id !== 'question_zero');
  const nextStep: NextStep = upcoming ? { title: upcoming.title, href: upcoming.href, why: upcoming.why } : null;

  return (
    <Shell
      title="Business expectations"
      subtitle={showAll
        ? 'Every question in the diagnostic. Record the genuine answers, not the polite version.'
        : 'The questions that decide what happens next. Record the genuine answers, not the polite version.'}
    >
      <Interview steps={steps} initial={initial} nextStep={nextStep} />
      {!showAll && remaining > 0 && (
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-ink-light/70">
          There are {remaining} further questions in the diagnostic — cost base, confidence, client sentiment,
          how we communicate. Claude asks for each at the step that uses it, so nothing here is homework.{' '}
          <Link href="/setup/expectations?all=1" className="underline hover:text-rust">Answer them all now instead</Link>
        </p>
      )}
    </Shell>
  );
}
