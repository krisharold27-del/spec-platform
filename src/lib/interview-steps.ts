import type { Step } from '@/components/interview';
import type { Dose } from './doses';

export type Q = { id: string; text: string; type?: string; options?: string[] };
export type Section = {
  id: string; title: string; when: string; intro?: string; type?: string;
  questions?: Q[]; items?: string[]; scale?: string[]; text?: string;
};

/**
 * Flatten one dose of the diagnostic into an ordered run of questions for the interview.
 *
 * Lives here rather than beside the page because Next validates the exports of a page module and
 * will not accept an extra named export from one.
 */
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

