import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { Interview, type Step } from '@/components/interview';
import diagnostic from '../../../../seed/diagnostic.json';

export const dynamic = 'force-dynamic';

type Q = { id: string; text: string; type?: string; options?: string[] };
type Section = {
  id: string; title: string; when: string; intro?: string; type?: string;
  questions?: Q[]; items?: string[]; scale?: string[]; text?: string;
};

/** Flatten the diagnostic into a single ordered run of questions for the interview. */
function toSteps(sections: Section[]): Step[] {
  const steps: Step[] = [];
  for (const s of sections) {
    for (const q of s.questions ?? []) {
      steps.push({
        sectionId: s.id, questionId: q.id, sectionTitle: s.title, intro: s.intro,
        text: q.text,
        kind: q.type === 'choice' ? 'choice' : 'text',
        options: q.options,
      });
    }
    if (s.type === 'rating' && s.items) {
      s.items.forEach((item, idx) => {
        steps.push({
          sectionId: s.id, questionId: `item${idx}`, sectionTitle: s.title, intro: s.intro,
          text: `How well is this understood — ${item}?`,
          kind: 'rating', options: s.scale ?? [],
        });
      });
    }
    if (s.type === 'agreement' && s.text) {
      steps.push({
        sectionId: s.id, questionId: 'accepted', sectionTitle: s.title, intro: s.intro,
        text: 'Do you accept this covenant on behalf of the business?',
        kind: 'agreement', agreementText: s.text,
      });
    }
  }
  return steps;
}

export default async function Expectations() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');

  const rows = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId));
  const initial: Record<string, string> = {};
  for (const r of rows) if (r.answer) initial[`${r.sectionId}:${r.questionId}`] = r.answer;

  const sections = (diagnostic.sections as Section[]).filter(s => ['before_day_one', 'week_one'].includes(s.when));
  const steps = toSteps(sections);

  return (
    <Shell
      title="Business expectations"
      subtitle="Claude walks the leader through these in week one. Record the genuine answers, not the polite version."
    >
      <Interview steps={steps} initial={initial} />
    </Shell>
  );
}
