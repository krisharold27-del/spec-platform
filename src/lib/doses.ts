/**
 * The diagnostic, given in doses.
 *
 * Every question in the diagnostic is necessary. Asking all of them at once is not: a leader
 * arriving with a business full of problems will not sit through forty-six questions before the
 * system does anything for them. So the diagnostic is split into doses, each attached to the step
 * that actually consumes its answers — the cost base beside the gross profit target, confidence and
 * client sentiment beside the KPIs they become, the communication questions beside the meeting
 * rhythm they set.
 *
 * Nothing is dropped: every question belongs to exactly one dose, and the totals are asserted in
 * tests so a question cannot be orphaned by an edit to the seed file.
 */

export interface Dose {
  id: string;
  /** Shown as the page title when this dose is being asked. */
  title: string;
  /** One line saying why these questions are being asked here, in this moment. */
  why: string;
  /** Section ids to draw from. */
  sections: string[];
  /** When set, only these question ids from those sections. */
  only?: string[];
  /** When set, these question ids are excluded. */
  except?: string[];
  /** Include rating-checklist items from the listed sections. */
  includeRatings?: boolean;
  /** Include the agreement (how we'll work together). */
  includeAgreement?: boolean;
}

export const DOSES: Record<string, Dose> = {
  core: {
    id: 'core',
    title: 'Business expectations',
    why: 'The questions that decide what happens next.',
    sections: ['question_zero', 'org_diagnostic', 'financial_truth_matrix', 'confidence'],
    only: ['qz1', 'od1', 'od3', 'od6', 'ftm1', 'ftm2', 'ftm3', 'c3'],
  },
  strategy: {
    id: 'strategy',
    title: 'Where the business is going',
    why: 'The ambition behind the year 1 answer, and what success actually looks like to you.',
    sections: ['org_diagnostic', 'success', 'timeline'],
    except: ['od1', 'od3', 'od6'],
  },
  commercial: {
    id: 'commercial',
    title: 'The cost and revenue base',
    why: 'Asked here because the gross profit target is only as good as the cost base underneath it.',
    sections: ['commercial_reality', 'coverage_checklist'],
    includeRatings: true,
  },
  kpis: {
    id: 'kpis',
    title: 'What you watch, and what clients think',
    why: 'These answers become KPIs, so they are asked while the KPIs are being set.',
    sections: ['confidence', 'nps'],
    except: ['c3'],
  },
  rhythm: {
    id: 'rhythm',
    title: 'How we communicate',
    why: 'Asked while the meeting rhythm is being set, because that is what these answers decide.',
    sections: ['communication', 'trust'],
  },
  agreement: {
    id: 'agreement',
    title: "How we'll work together",
    why: 'The last thing, once the system has produced something real.',
    sections: ['covenant'],
    includeAgreement: true,
  },
};

export function doseFor(id: string | undefined): Dose {
  return DOSES[id ?? 'core'] ?? DOSES.core;
}

export interface SeedQuestion { id: string; type?: string }
export interface SeedSection {
  id: string; type?: string; questions?: SeedQuestion[]; items?: string[]; text?: string;
}

/**
 * Every question key a dose covers, as [sectionId, questionId]. Used both to build the interview
 * and to check whether the step is finished, so the two can never disagree.
 */
export function doseQuestionKeys(dose: Dose, sections: SeedSection[]): [string, string][] {
  const keys: [string, string][] = [];
  for (const s of sections) {
    if (!dose.sections.includes(s.id)) continue;
    for (const q of s.questions ?? []) {
      if (dose.only && !dose.only.includes(q.id)) continue;
      if (dose.except && dose.except.includes(q.id)) continue;
      keys.push([s.id, q.id]);
    }
    if (dose.includeRatings && s.type === 'rating' && s.items) {
      s.items.forEach((_, i) => keys.push([s.id, `item${i}`]));
    }
    if (dose.includeAgreement && s.type === 'agreement' && s.text) {
      keys.push([s.id, 'accepted']);
    }
  }
  return keys;
}
