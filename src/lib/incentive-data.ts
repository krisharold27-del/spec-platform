import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getRoles, getScorecard, PILLARS } from './queries';
import { isScored } from './today-data';
import { incentiveFor, aceByMonth, ACE_MONTHS_REQUIRED, DEFAULT_CEILINGS, FAILED_AT_OR_BELOW, type IncentiveResult } from './incentive';
import { ceilingsFor } from './ceilings';
import type { Pillar, Score } from './scoring';

/**
 * What one role's incentive comes to this month, read from what the business has actually recorded.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * lib/incentive has been complete and fully tested for weeks — ceilings, the Sales Ace doubling, 5%
 * per failed quadrant, the 25% cap — and NOTHING IMPORTED IT. The rule was right and no customer
 * could see it. For a manager, the incentive is the part that makes a scorecard matter: it is the
 * difference between a page of numbers and a page about their month.
 *
 * This is the missing half — the read that turns the engine's pure arithmetic into this person's
 * actual figure.
 */

export interface FailedQuadrant {
  roleTitle: string;
  person: string | null;
  pillar: Pillar;
  score: number;
}

export interface IncentiveView extends IncentiveResult {
  /** Every quadrant beneath them that failed, named — never just a count. */
  failed: FailedQuadrant[];
  /**
   * Empty, and kept so the panel can stay honest if the two lines ever part again.
   *
   * There WAS a gap: the chart turned red at 75% while the incentive only failed under 50%, so
   * somebody could see three red quadrants and no deduction. Kris made them one line, so red on a
   * card and a deduction now mean the same thing and there is nothing to explain away.
   */
  redButNotFailed: FailedQuadrant[];
  /** The role's own level, for saying which ceiling applies. */
  level: string;
  /** Whether this business has set its own ceilings, so the page can say so rather than imply ours. */
  ownCeilings: boolean;
  /** The Ace run: how this month sits in the three, and whether it is the one that pays. */
  ace: AceRun;
}

/**
 * Three consecutive months at the standard, then it pays double and the count starts again.
 *
 * Shown as a run rather than a badge because the run is the useful part: "two of three" tells
 * somebody exactly what next month is worth, and a badge tells them nothing.
 */
export interface AceRun {
  /** What it is called for this role — a sales role earns one, an operations role the other. */
  name: 'Sales Ace' | 'Ops Ace';
  /** Closed months behind this one, oldest first, with whether each held the standard. */
  run: { period: string; held: boolean }[];
  /** How many consecutive months at the standard stand behind this one. */
  consecutive: number;
  required: number;
  /** True when THIS month completes the run, which is the month that pays double. */
  paysThisMonth: boolean;
}

/**
 * Every pillar score beneath this role, including its own.
 *
 * Failures flow upward: a leader is reduced for a team doing badly and never credited for one doing
 * well. So the walk is strictly downward from this role, and a pillar with no score is skipped —
 * pending is not a failure, and counting it as one would deduct money for a month nobody has marked
 * yet.
 */
async function chainBeneath(tenantId: string, roleId: string, periodId: string) {
  const roles = await getRoles(tenantId);
  const byParent = new Map<string, typeof roles>();
  for (const r of roles) {
    const key = r.reportsToRoleId ?? '';
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }

  // `seen` doubles as the visited set, so a bad reportsTo cycle can never spin here.
  const seen = new Set<string>([roleId]);
  const queue = [roleId];
  const out: { role: (typeof roles)[number]; pillars: Record<Pillar, Score> }[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    const role = roles.find(r => r.id === id);
    if (role) {
      const criteria = await db.select().from(schema.criteria)
        .where(and(eq(schema.criteria.roleId, id), eq(schema.criteria.active, true)));
      if (isScored(role.level, criteria.length)) {
        const { score } = await getScorecard(id, periodId);
        out.push({ role, pillars: score.pillars });
      }
    }
    for (const child of byParent.get(id) ?? []) {
      if (!seen.has(child.id)) { seen.add(child.id); queue.push(child.id); }
    }
  }
  return out;
}

/**
 * The figure, and the working behind it.
 *
 * `redButNotFailed` is the part that stops an argument before it starts. The chart paints a quadrant
 * red from 75% down, and the incentive only deducts under 50% — so a manager can be looking at three
 * red quadrants and a deduction of nothing, and without being told why, that reads as the software
 * being wrong. Naming those quadrants is the difference between a rule and an apparent bug.
 */
export async function incentiveView(
  tenantId: string,
  roleId: string,
  periodId: string,
  opts: { incentivesOn?: boolean } = {},
): Promise<IncentiveView | null> {
  const roles = await getRoles(tenantId);
  const role = roles.find(r => r.id === roleId);
  if (!role) return null;

  const chain = await chainBeneath(tenantId, roleId, periodId);
  const mine = chain.find(c => c.role.id === roleId);

  const chainPillars: Score[] = [];
  const failed: FailedQuadrant[] = [];
  const redButNotFailed: FailedQuadrant[] = [];

  for (const { role: r, pillars } of chain) {
    for (const p of PILLARS) {
      const v = pillars[p];
      chainPillars.push(v);
      if (v === null) continue;
      const where = { roleTitle: r.title, person: r.holder?.name ?? null, pillar: p, score: v };
      if (v <= FAILED_AT_OR_BELOW) failed.push(where);
    }
  }

  const ownPct = mine
    ? (() => {
        const scored = PILLARS.map(p => mine.pillars[p]).filter((v): v is number => v !== null);
        return scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : null;
      })()
    : null;

  /*
    This business's own ceilings, not SPEC's. The ladder is a suggestion — "Ceilings are defaults,
    not law" — and reading the default table here would have quietly overruled whatever the business
    actually agreed to pay.
  */
  const [tenant] = await db.select({ ceilings: schema.tenants.ceilings })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));

  /*
    The Ace run, from this role's own closed months plus the one being read.

    Ordered oldest first because the rule is about a SEQUENCE — three in a row, then it pays and the
    count restarts. Reading them in any other order would answer a different question.
  */
  const periods = (await db.select().from(schema.periods)
    .where(eq(schema.periods.tenantId, tenantId)))
    .filter(p => p.status === 'locked' || p.id === periodId)
    .sort((a, b) => a.period.localeCompare(b.period));

  const history: { period: string; pct: Score }[] = [];
  for (const p of periods) {
    if (p.id === periodId) { history.push({ period: p.period, pct: ownPct }); continue; }
    const { score } = await getScorecard(roleId, p.id);
    const scored = PILLARS.map(x => score.pillars[x]).filter((v): v is number => v !== null);
    history.push({ period: p.period, pct: scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : null });
  }

  const pays = aceByMonth(history.map(h => ({ rolePct: h.pct })));
  const paysThisMonth = pays[pays.length - 1] ?? false;

  // How many in a row stand behind this month — counted the same way aceByMonth counts them, so the
  // number on the page and the month that pays can never disagree.
  let consecutive = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const at = history[i].pct;
    if (at !== null && at >= 0.9) consecutive += 1; else break;
    if (consecutive >= ACE_MONTHS_REQUIRED) break;
  }

  const ace: AceRun = {
    name: role.stream === 'operations' ? 'Ops Ace' : 'Sales Ace',
    run: history.slice(-6).map(h => ({ period: h.period, held: h.pct !== null && h.pct >= 0.9 })),
    consecutive,
    required: ACE_MONTHS_REQUIRED,
    paysThisMonth,
  };

  const result = incentiveFor({
    roles: [{ level: role.level, rolePct: ownPct }],
    chainPillars,
    // The doubling applies in the month the run completes, and only then.
    salesAce: paysThisMonth,
    incentivesOn: opts.incentivesOn,
    ceilings: ceilingsFor(tenant?.ceilings),
  });

  return {
    ...result, failed, redButNotFailed, level: role.level,
    ownCeilings: Boolean(tenant?.ceilings?.trim()), ace,
  };
}

export { DEFAULT_CEILINGS };
