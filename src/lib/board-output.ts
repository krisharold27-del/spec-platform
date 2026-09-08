/**
 * Monthly board output. Generated from the period's data — never written from memory.
 * With ANTHROPIC_API_KEY set, Claude writes the plain-terms sections from the facts below, reasoning from SPEC principles.
 * Without it, the deterministic version is produced from the same facts so the demo works offline.
 */
import type { getTeamRollup, getGates } from './queries';
import type { Pillar } from './scoring';
import type { GovernanceCheck } from './governance';

type Rollup = Awaited<ReturnType<typeof getTeamRollup>>;
type Gates = Awaited<ReturnType<typeof getGates>>;

export interface BoardInputs {
  tenantName: string;
  period: string;
  rollup: Rollup;
  gates: Gates;
  pillars: Pillar[];
  /** Governance sits inside Compliance — see src/lib/governance.ts. */
  governance?: GovernanceCheck[];
}

/**
 * The front page: four pillars, the gates, and anything that could bite — sized for a two-minute
 * read before the meeting starts. A director who reads only this should still know whether the
 * business made its money, did it safely, whether people are staying, and whether anything is
 * about to land on them. The detail behind it is for the ones who want to dig.
 */
export interface Snapshot {
  headline: string;
  pillars: { pillar: Pillar; name: string; value: number | null; status: 'on_target' | 'below' | 'not_scored'; driver: string | null }[];
  gates: { name: string; status: 'pass' | 'fail' | 'not_reporting'; detail: string }[];
  risks: string[];
  integrity: string | null;
}

export function snapshotFor(i: BoardInputs): Snapshot {
  const f = factsFor(i);
  const gov = i.governance ?? [];

  const pillars = i.pillars.map(p => {
    const v = i.rollup.team.pillars[p];
    const driver = f.misses.filter(m => m.pillar === p)[0];
    return {
      pillar: p,
      name: NAME[p],
      value: f.baseline ? null : v,
      status: (f.baseline ? 'not_scored' : v >= 0.9 ? 'on_target' : 'below') as 'on_target' | 'below' | 'not_scored',
      driver: driver ? `${driver.role}: ${driver.text}` : null,
    };
  });

  const gates: Snapshot['gates'] = [
    {
      name: 'Zero Harm',
      status: i.gates.zeroHarm ? (i.gates.zeroHarm.pass ? 'pass' : 'fail') : 'not_reporting',
      detail: i.gates.zeroHarm ? String(i.gates.zeroHarm.value) : 'Nothing entered — this is a blank, not a clean month',
    },
    {
      name: 'Clear to Work',
      status: i.gates.clearToWork ? (i.gates.clearToWork.pass ? 'pass' : 'fail') : 'not_reporting',
      detail: i.gates.clearToWork ? `Training compliance ${pct(Number(i.gates.clearToWork.value))}, must be 100%` : 'No training records entered',
    },
  ];

  // Anything a director would want raised before they have to ask.
  const risks: string[] = [];
  for (const g of gates) if (g.status === 'fail') risks.push(`${g.name} failed — ${g.detail}.`);
  for (const g of gates) if (g.status === 'not_reporting') risks.push(`${g.name} is not reporting. ${g.detail}.`);
  for (const p of pillars) if (p.status === 'below' && p.driver) risks.push(`${p.name} below target — ${p.driver}.`);
  for (const c of gov) if (c.status !== 'pass') risks.push(`Governance: ${c.detail}${c.fix ? ` Fix: ${c.fix}` : ''}`);
  const noFix = f.misses.filter(m => !m.note).length;
  if (noFix) risks.push(`${noFix} missed criteria have no proposed fix against them.`);

  const onTarget = pillars.filter(p => p.status === 'on_target').length;
  const headline = f.baseline
    ? 'Baseline month. Nothing has been scored yet, so nothing below is a result — this is the starting position.'
    : onTarget === 4
      ? 'All four pillars are at or above 90%. The business made the money it expected, did it safely, and its people are staying.'
      : `${onTarget} of 4 pillars at target. ${risks.length} item${risks.length === 1 ? '' : 's'} for the board's attention.`;

  return {
    headline,
    pillars,
    gates,
    risks,
    integrity: f.unscored.length || !i.gates.entered
      ? `Read with care: ${f.unscored.length} role(s) unscored, gates ${i.gates.entered ? 'entered' : 'not entered'}.`
      : null,
  };
}

const NAME: Record<Pillar, string> = { safety: 'Safety', people: 'People', earnings: 'Earnings', compliance: 'Compliance' };
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function factsFor(i: BoardInputs) {
  const scored = i.rollup.roles.filter(r => r.rows.some(x => x.answer !== ''));
  const unscored = i.rollup.roles.filter(r => !r.rows.some(x => x.answer !== ''));
  const misses = scored.flatMap(r => r.rows.filter(x => x.answer === 'N').map(x => ({ role: r.role.title, pillar: x.pillar as Pillar, text: x.text, note: x.note })));
  return { scored, unscored, misses, baseline: scored.length === 0 };
}

export function deterministicBoardOutput(i: BoardInputs): string {
  const f = factsFor(i);
  const L: string[] = [];
  L.push(`# SPEC Board Output — ${i.tenantName} — ${i.period}`);
  L.push('');
  L.push(`Prepared from the period's scorecards and gates. ${f.scored.length} of ${i.rollup.roleCount} roles scored.`);
  L.push('');
  if (f.baseline) {
    L.push('## How to read this month');
    L.push('');
    L.push('Baseline month. No role has been scored, so there are no performance figures to report — only the work still to do. Nothing below is a result.');
    L.push('');
  }
  L.push('## Four pillars vs the 90% target');
  L.push('');
  for (const p of i.pillars) {
    const v = i.rollup.team.pillars[p];
    const status = f.baseline ? 'NOT YET SCORED' : v >= 0.9 ? 'ON TARGET' : 'BELOW TARGET';
    const driver = f.misses.filter(m => m.pillar === p);
    L.push(`**${NAME[p]}** — ${f.baseline ? '—' : pct(v)} · ${status}${!f.baseline && v < 0.9 ? ` · gap ${Math.round((0.9 - v) * 100)} points` : ''}`);
    if (driver.length) L.push(`Headline driver: ${driver.map(d => `${d.role}: ${d.text}${d.note ? ` — fix proposed: ${d.note}` : ' — no fix proposed yet'}`).join('; ')}.`);
    L.push('');
  }
  // Governance belongs inside Compliance — a business can breach nothing and still be ungoverned.
  if (i.governance?.length) {
    L.push('## Compliance — governance');
    L.push('');
    for (const c of i.governance) {
      const label = c.status === 'pass' ? 'OK' : c.status === 'attention' ? 'NEEDS ATTENTION' : 'NOT REPORTING';
      L.push(`**${c.question}** — ${label}. ${c.detail}${c.fix ? ` Fix: ${c.fix}` : ''}`);
    }
    L.push('');
  }
  L.push('## Hard gates');
  L.push('');
  L.push(`Zero Harm — ${i.gates.zeroHarm ? (i.gates.zeroHarm.pass ? 'PASS' : 'FAIL') + ` (${i.gates.zeroHarm.value})` : 'NOT REPORTING — nothing entered; this is a baseline state, not a clean month'}.`);
  L.push(`Clear to Work — ${i.gates.clearToWork ? (i.gates.clearToWork.pass ? 'PASS' : 'FAIL') + ` (training compliance ${pct(Number(i.gates.clearToWork.value))}, must be 100%)` : 'NOT REPORTING — no training records entered'}.`);
  L.push('');
  L.push('## In plain terms');
  L.push('');
  L.push(`**What's going well:** ${f.scored.length ? f.scored.filter(r => r.score.overall >= 0.9).map(r => r.role.title).join(', ') || 'No role is at 90% yet.' : 'The measurement system is set up.'}`);
  L.push('');
  L.push(`**What needs attention:** ${f.misses.length ? `${f.misses.length} criteria missed, ${f.misses.filter(m => !m.note).length} without a proposed fix.` : f.baseline ? 'Nothing has been scored.' : 'No misses recorded.'}${f.unscored.length ? ` Unscored roles: ${f.unscored.map(r => r.role.title).join(', ')}.` : ''}`);
  L.push('');
  L.push(`**What we need from the owner:** ${f.unscored.length ? 'Time for each unscored role holder to complete their scorecard.' : ''}${!i.gates.entered ? ' Incident figures and training records so both gates report real numbers.' : ''}${i.gates.clearToWork && !i.gates.clearToWork.pass ? ' Sign-off to close the training gaps behind the Clear to Work fail.' : ''}`.trim() || 'Nothing outstanding.');
  L.push('');
  L.push('## Data integrity');
  L.push('');
  L.push(f.unscored.length || !i.gates.entered ? `Incomplete: ${f.unscored.length} role(s) unscored; gates ${i.gates.entered ? 'entered' : 'not entered'}.` : 'Complete: every role scored and both gates entered.');
  L.push('');
  L.push('_The business is SPEC when all four pillars hold at 90%+ for two consecutive months._');
  L.push('');
  L.push('_The simplest read of this pack: did the business make the money it expected, did it do that safely, and does everyone want to come to work? If all three are yes, the job is done._');
  return L.join('\n');
}

export async function generateBoardOutput(i: BoardInputs): Promise<string> {
  const base = deterministicBoardOutput(i);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return base;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: 'You write monthly board outputs for the SPEC operating system (Safety, People, Earnings, Compliance). Principles: make money, do it safely, ensure everyone loves their job. Rules: never present an empty template as a result; every miss needs a proposed fix; the business is SPEC only when all four pillars hold at 90%+ for two consecutive months; hard gates are pass/fail. Rewrite the draft below in plain terms for a business owner, keeping every figure exactly as given, adding one paragraph of reasoning per pillar below target from SPEC principles. Australian English. Markdown. No preamble.',
        messages: [{ role: 'user', content: base }],
      }),
    });
    if (!res.ok) return base;
    const data = await res.json() as { content: { type: string; text?: string }[] };
    const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return text || base;
  } catch { return base; }
}
