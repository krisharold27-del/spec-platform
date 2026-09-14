import { PILLARS, type Pillar } from './scoring';

/**
 * What a structure is missing — pure functions, no I/O and no model.
 *
 * ── Why the structural reading exists at all ─────────────────────────────────────────────────────
 *
 * Design export 5 calls this "Claude's read of what this structure is still missing", and Claude is
 * genuinely better at it — it can tell that an electrical contractor at forty people needs a Yard
 * Lead and a transport business needs a Fleet & Compliance Lead. But SPEC Basic is a complete way to
 * run the whole system, not a crippled one: "no feature anywhere is reachable only by connecting
 * something." A business on Basic, or one whose API key is not set, still gets a chart with holes in
 * it, and those holes are the reason they bought SPEC.
 *
 * So the findings below are the ones that are ARITHMETIC on the leader's own chart rather than
 * judgement about their industry. Every one of them is right or wrong for a reason anybody can
 * check by looking:
 *
 *   - a stream with nobody owning it
 *   - a pillar no scored role measures
 *   - a manager with more direct reports than anybody can actually manage
 *   - a head with no one beneath them, in a business too big for that to be true
 *
 * None of these needs to know what an electrical contractor is. They are also the ones that would
 * embarrass SPEC most if it missed them, because the customer can see them too.
 *
 * Claude's reading is layered ON TOP of this in lib/predict-data, never instead of it, and each
 * proposal carries which of the two produced it — see `source` on the table. The structural reading
 * can be checked; a judgement has to be trusted. Labelling them the same would quietly borrow the
 * credibility of one for the other.
 */

/** The three streams every business has an owner for. Matches the seed templates. */
export const STREAM_NAMES: Record<string, string> = {
  commercial: 'Commercial',
  operations: 'Operations',
  growth: 'Growth',
};

/** More direct reports than this and the span is the problem, whoever holds the seat. */
export const SPAN_LIMIT = 7;

export interface RoleShape {
  id: string;
  title: string;
  stream: string;
  level: string;
  reportsToRoleId: string | null;
  /** Pillars this role actually measures — from its active KPI criteria. */
  pillars: Pillar[];
  /** Whether anybody holds it, pencilled or invited. A vacant role is still a role. */
  filled: boolean;
}

export interface Proposal {
  title: string;
  /** The role it would sit under, or null when nothing sensible exists to hang it off yet. */
  parentRoleId: string | null;
  why: string;
  stream: string;
  level: string;
}

/**
 * What this chart is missing, read from the chart itself.
 *
 * Ordered by how much it costs to be wrong about: a stream nobody owns, then a pillar nobody
 * measures, then a span nobody can hold. A leader reads the list top down and the first thing they
 * see is the biggest hole.
 *
 * Never proposes more than `limit`. A list of eleven things to approve is a list nobody approves.
 */
export function structuralGaps(roles: RoleShape[], limit = 3): Proposal[] {
  if (roles.length === 0) return [];
  const out: Proposal[] = [];
  const gm = roles.find(r => r.level === 'gm') ?? roles.find(r => !r.reportsToRoleId) ?? null;

  /*
    A stream with nobody owning it.

    The sharpest finding there is, because the model rests on it: "who owns the numbers" has to have
    exactly one answer per stream, and a stream with no head means a quarter of the business has
    nobody accountable for it at all.
  */
  for (const [stream, name] of Object.entries(STREAM_NAMES)) {
    if (roles.some(r => r.stream === stream && r.level === 'manager')) continue;
    const beneath = roles.filter(r => r.stream === stream).length;
    out.push({
      title: `Head of ${name}`,
      parentRoleId: gm?.id ?? null,
      stream,
      level: 'manager',
      why: beneath > 0
        ? `${beneath} ${beneath === 1 ? 'role sits' : 'roles sit'} in ${name} and none of them owns it. A stream has one owner — that is what makes "who owns the numbers" answerable.`
        : `Nobody owns ${name}. Every business has these numbers whether or not somebody is accountable for them.`,
    });
  }

  /*
    A pillar no scored role measures.

    Not the same as a pillar scoring badly — this is a pillar the business is not looking at, which
    shows up as grey on every card rather than as a problem. Grey is the easiest thing on a chart to
    stop noticing.
  */
  const measured = new Set(roles.flatMap(r => r.pillars));
  const unmeasured = PILLARS.filter(p => !measured.has(p));
  if (unmeasured.length > 0 && roles.some(r => r.pillars.length > 0)) {
    for (const p of unmeasured) {
      const owner = ownerFor(p, roles) ?? gm;
      out.push({
        title: `${PILLAR_ROLE[p]}`,
        parentRoleId: owner?.id ?? null,
        stream: PILLAR_STREAM[p],
        level: 'supervisor',
        why: `No role on the chart measures ${p[0].toUpperCase()}${p.slice(1)}. It is showing grey on every card rather than showing a problem, and grey is the easiest thing on a chart to stop noticing.`,
      });
    }
  }

  /*
    A span nobody can hold.

    Deliberately about the SEAT and not the person: seven direct reports is where one-to-ones stop
    happening, whoever is in the chair, and People is the pillar that fails first when they stop.
  */
  for (const r of roles) {
    const reports = roles.filter(x => x.reportsToRoleId === r.id);
    if (reports.length <= SPAN_LIMIT) continue;
    out.push({
      title: `Supervisor, under ${r.title}`,
      parentRoleId: r.id,
      stream: r.stream,
      level: 'supervisor',
      why: `${r.title} has ${reports.length} direct reports. Past ${SPAN_LIMIT} the one-to-ones stop happening whoever holds the seat, and People is the pillar that fails first when they do.`,
    });
  }

  return out.slice(0, limit);
}

/** Which role would naturally own a pillar nobody is measuring. */
function ownerFor(pillar: Pillar, roles: RoleShape[]): RoleShape | null {
  const stream = PILLAR_STREAM[pillar];
  return roles.find(r => r.stream === stream && r.level === 'manager') ?? null;
}

/** The seat a business usually creates when a pillar has no owner. */
const PILLAR_ROLE: Record<Pillar, string> = {
  safety: 'Safety & Compliance Lead',
  people: 'Training Coordinator',
  earnings: 'Commercial Analyst',
  compliance: 'Compliance Coordinator',
};

const PILLAR_STREAM: Record<Pillar, string> = {
  safety: 'operations',
  people: 'operations',
  earnings: 'commercial',
  compliance: 'commercial',
};

/**
 * Proposals worth showing: not already a role, not already proposed, not already refused.
 *
 * The last one is the important one. Proposing the same Yard Lead every month after somebody has
 * said no is how software teaches people to stop reading it — and it is the exact behaviour that
 * makes a leader mistrust everything else on the page.
 *
 * Titles are compared case- and space-insensitively, because "Yard lead" and "Yard Lead" are the
 * same proposal to everybody except a database.
 */
export function worthProposing(
  proposals: Proposal[],
  existingTitles: string[],
  alreadyProposed: string[],
): Proposal[] {
  const taken = new Set([...existingTitles, ...alreadyProposed].map(normaliseTitle));
  const seen = new Set<string>();
  return proposals.filter(p => {
    const key = normaliseTitle(p.title);
    if (taken.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const normaliseTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
