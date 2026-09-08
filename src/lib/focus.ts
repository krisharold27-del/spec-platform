/**
 * What each answer to the pillar drill-down actually means, and where the work starts.
 *
 * The four questions say where it hurts. This says why, and hands the leader a starting point
 * instead of a diagnosis they have to interpret themselves. Every line names the cause and the
 * stream that owns it, because "who owns this" is the question the org chart then answers.
 */
export const READBACK: Record<string, string> = {
  // Safety
  'safety:Incidents keep happening':
    'That is a supervision and process problem before it is a paperwork one, and it sits in Operations.',
  "safety:The paperwork and records don't keep up":
    'That is an ownership problem rather than a safety problem — the safety file needs a name against it.',
  "safety:Supervisors aren't confident running it":
    'That is capability. Supervisors have to be signed off as genuinely capable before anything else holds.',
  'safety:Clients or auditors keep raising it':
    'That is evidence. The work may well be fine, but you cannot currently show it.',

  // People
  'people:Losing good people':
    'Turnover is the symptom. The cause is almost always role clarity, or the manager directly above them.',
  "people:Can't hire the ones we need":
    'Before hiring harder, check the role is actually defined — and whether it has to be a hire at all.',
  "people:Nobody's clear what their job actually is":
    'That is precisely what the org chart and the scorecards fix. You are starting in the right place.',
  "people:Managers aren't managing":
    'That is accountability, not instruction. It needs KPIs the manager owns rather than more direction.',

  // Earnings
  'earnings:Margin is thinner than it should be':
    'Start with the cost base. Most margin leaks are costs that were never put into the price.',
  'earnings:Numbers arrive too late to act on':
    'That is reporting cadence. Monthly, then weekly, instead of finding out at quarter end.',
  "earnings:I don't trust the numbers I get":
    'The numbers may be sound and the reporting broken. That split is the first thing to test.',
  "earnings:Busy but the cash isn't there":
    'Busy and profitable are different questions. Treat this as pricing and invoicing until proven otherwise.',

  // Compliance
  'compliance:Tickets and licences expire without warning':
    'A register with an owner fixes this, and it is the fastest win available here.',
  'compliance:Contract obligations slipping':
    'Contract obligations belong to whoever owns the client — Commercial or Growth, never nobody.',
  "compliance:Records exist but can't be produced":
    'You are compliant and cannot prove it. That is a system problem, not a behaviour one.',
  'compliance:Nobody owns it':
    'Then the org chart is the fix. Compliance without an owner is a gap, not a task.',
};

/** The sentence the leader sees before being sent into the org chart. */
export function readBack(answers: { pillar: string; answer: string }[]): string {
  const lines = answers
    .map(a => READBACK[`${a.pillar}:${a.answer}`])
    .filter(Boolean);
  if (!lines.length) return 'Next: build the org chart, so every problem you have named has someone against it.';
  return `${lines.join(' ')} Build the org chart next — it is what puts a name against each of these.`;
}
