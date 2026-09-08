import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { Interview, type Step, type NextStep } from '@/components/interview';
import { readBack } from '@/lib/focus';
import diagnostic from '../../../../seed/diagnostic.json';

export const dynamic = 'force-dynamic';

type Q = { id: string; text: string; type?: string; options?: string[]; pillar?: string };
type Section = { id: string; title: string; intro?: string; questions?: Q[] };

/**
 * "You said Safety — let's understand that."
 *
 * Only the pillars answered yes at /start are asked about, one question each. A business hurting on
 * one pillar answers one question; the worst case is four. Then it hands straight to the org chart,
 * because the fastest way to help someone drowning in problems is to stop asking and start showing.
 */
export default async function Focus() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');

  const rows = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId));
  const hurting = rows.filter(r => r.sectionId === 'four_questions' && r.answer === 'yes').map(r => r.questionId);
  const answered: Record<string, string> = {};
  for (const r of rows) if (r.sectionId === 'pillar_drilldown' && r.answer) answered[`pillar_drilldown:${r.questionId}`] = r.answer;

  // Nothing hurts, or this was never asked — there is nothing to understand here.
  if (hurting.length === 0) redirect('/setup/path');

  const section = (diagnostic.sections as Section[]).find(s => s.id === 'pillar_drilldown')!;
  const steps: Step[] = (section.questions ?? [])
    .filter(q => hurting.includes(q.pillar ?? q.id))
    .map(q => ({
      sectionId: 'pillar_drilldown', questionId: q.id, sectionTitle: section.title, intro: section.intro,
      text: q.text, kind: 'choice', options: q.options,
    }));

  // The payoff: what their answers mean, and where the work starts.
  const given = steps
    .map(s => ({ pillar: s.questionId, answer: answered[`pillar_drilldown:${s.questionId}`] ?? '' }))
    .filter(a => a.answer);
  // The fork comes here, straight off the diagnostic — before hours have gone in, per the brief.
  const nextStep: NextStep = {
    title: 'Choose how you want to do this',
    href: '/setup/path',
    why: readBack(given),
  };

  return (
    <Shell
      title="Let's understand that"
      subtitle={`You said ${hurting.length === 1 ? 'this is' : 'these are'} hurting. One question each — we're after the cause, not the symptom.`}
    >
      <Interview steps={steps} initial={answered} nextStep={nextStep} />
    </Shell>
  );
}
