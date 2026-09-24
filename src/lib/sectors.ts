/**
 * The sectors a business works in, and the kinds of work inside them.
 *
 * ── Kris, 24 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"so as an example jbi has 4 sectors - industrial, commercial, renewables and mining - both
 * maintenance and project work including shutdowns"*, then, settling the word the next morning:
 * *"sectors commercial, operations and growth - sectors industrial, commercial, mining and
 * renewables but this is jbi"*.
 *
 * So: **sectors** are the three every business runs on (`lib/sectors`), and **sectors** are the
 * markets one business works in. JBI has four, and the "but this is jbi" is the important half —
 * they are that business's own, and no list SPEC ships could guess them.
 *
 * Two axes, and they are independent. A business works in some number of MARKETS, and inside each
 * one it does some mix of KINDS of work. JBI is four by three. Renewables maintenance and mining
 * shutdowns are both JBI, and almost nothing about running them is the same.
 *
 * ── Why this is not `lib/industries` ─────────────────────────────────────────────────────────────
 *
 * `lib/industries` answers what KIND OF BUSINESS this is, once, when it signs up — a trade
 * business, a professional firm, a hospitality group. This is the layer under that: the sectors one
 * business serves, which are its own. Nobody outside JBI knows JBI has four, and a fixed list would
 * be wrong for the second business that signed up.
 *
 * (That file was called `sectors` until Kris settled the vocabulary, and took the name that its own
 * first line had always used.)
 *
 * ── Why it matters more than it looks ────────────────────────────────────────────────────────────
 *
 * A four-sector business reading one pipeline number is a business that cannot see the thing most
 * likely to hurt it. Turnover holds, the board is busy, everything looks fine — and mining has not
 * quoted anything in two months. By the time it shows in the total it is a hole that took two
 * months to dig and will take six to fill.
 *
 * That is the specific failure this file exists to make impossible, and it is the Growth sector's
 * job: *"making sure new work is coming in steadily"* is four separate questions in a business like
 * JBI, and answering the average of them answers none.
 *
 * ── "Commercial" means two things, and that is fine ──────────────────────────────────────────────
 *
 * Commercial is one of the three sectors AND one of JBI's four sectors. The collision is real and
 * it is kept, because both are the words Kris's people actually use and inventing a replacement
 * they would have to be taught is worse than a word that means two things in two places.
 *
 * The screens keep them apart by asking different questions: *who owns this work* is answered by a
 * sector, *what market did it come from* is answered by a sector. Nothing ever shows both lists
 * side by side without saying which is which.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * The kinds of work — fixed, because these three behave differently everywhere
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Maintenance, project, shutdown.
 *
 * Unlike the sectors, this list is not the business's to change, because it is not a description of
 * a market — it is a description of how work BEHAVES, and it behaves the same way in every trade
 * business there is. Maintenance recurs and can be relied on. A project is won, done and gone.
 * A shutdown is a project with a date that cannot move and a labour bill that arrives all at once.
 *
 * A business that cannot tell them apart cannot answer the only question that matters about its
 * revenue: how much of it will still be there next year without anybody selling anything.
 */
export const WORK_KINDS = [
  {
    key: 'maintenance',
    label: 'Maintenance',
    is: 'Work that comes back on its own — agreements, servicing, breakdowns for people who already call you.',
    steady: true,
    watch: 'The quiet killer is an agreement that lapsed and nobody renewed. It does not show as a loss, it shows as nothing.',
  },
  {
    key: 'project',
    label: 'Project',
    is: 'Won, built, finished. Then it is gone and the next one has to be won.',
    steady: false,
    watch: 'Every project ending is a hole that had to be filled weeks before it appeared.',
  },
  {
    key: 'shutdown',
    label: 'Shutdown',
    is: 'A project with a date that will not move — the plant is down, the window is fixed, and everything has to be there before it starts.',
    steady: false,
    watch: 'The cost is in the preparation, and the risk is that the window opens and something is missing. Nothing about it can be caught up later.',
  },
] as const;

export type WorkKind = (typeof WORK_KINDS)[number]['key'];
export const WORK_KEYS: WorkKind[] = WORK_KINDS.map(k => k.key);
export const isWorkKind = (v: string): v is WorkKind => (WORK_KEYS as string[]).includes(v);
export const workLabel = (k: string): string => WORK_KINDS.find(w => w.key === k)?.label ?? k;

/** A shutdown is a project that cannot slip. Everywhere the difference is only the date, this is true. */
export const isProjectLike = (k: WorkKind): boolean => k === 'project' || k === 'shutdown';

/* ─────────────────────────────────────────────────────────────────────────────
 * The sectors — the business's own
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Sector {
  id: string;
  /** The business's own word for it. JBI: Industrial, Commercial, Renewables, Mining. */
  name: string;
  /** Switched off rather than deleted, so its history stays readable. */
  active: boolean;
}

/**
 * What JBI's four look like, used as the example on an empty screen and nowhere else.
 *
 * Offered, never applied. A business that is shown four sectors it did not choose will keep them,
 * and then SPEC has quietly decided what markets somebody works in — which is exactly the kind of
 * helpfulness that makes a system feel like it is arguing with you.
 */
export const EXAMPLE_SECTORS = ['Industrial', 'Commercial', 'Renewables', 'Mining'] as const;

/* ─────────────────────────────────────────────────────────────────────────────
 * Where the work is
 * ───────────────────────────────────────────────────────────────────────────── */

export interface SectorJob {
  sectorId: string | null;
  kind: WorkKind | null;
  valueCents: number;
  /** Whether this is work already won, or work still being chased. */
  won: boolean;
  at: string;
}

export interface SectorShare {
  sectorId: string;
  name: string;
  wonCents: number;
  quotingCents: number;
  share: number;
  jobs: number;
}

/** How the won work divides across the sectors. Shares are of won work, never of the pipeline. */
export function mixOf(sectors: readonly Sector[], jobs: readonly SectorJob[]): SectorShare[] {
  const total = jobs.filter(j => j.won).reduce((n, j) => n + j.valueCents, 0);
  return sectors.map(s => {
    const mine = jobs.filter(j => j.sectorId === s.id);
    const wonCents = mine.filter(j => j.won).reduce((n, j) => n + j.valueCents, 0);
    return {
      sectorId: s.id,
      name: s.name,
      wonCents,
      quotingCents: mine.filter(j => !j.won).reduce((n, j) => n + j.valueCents, 0),
      share: total > 0 ? wonCents / total : 0,
      jobs: mine.length,
    };
  }).sort((a, b) => b.wonCents - a.wonCents);
}

/**
 * Past this share in one sector, a business is not diversified, it is exposed.
 *
 * Half is the line because of what it means practically rather than statistically: above it, losing
 * one client relationship does not dent the year, it decides it. Businesses with four sectors very
 * often have one real one and three they would like to have, and the four names on the letterhead
 * hide that from the people who wrote them.
 */
export const TOO_CONCENTRATED = 0.5;

export interface Concentration {
  top: SectorShare | null;
  exposed: boolean;
  says: string;
}

export function concentration(mix: readonly SectorShare[]): Concentration {
  const live = mix.filter(m => m.wonCents > 0);
  if (live.length === 0) {
    return { top: null, exposed: false, says: 'No work recorded against a sector yet.' };
  }
  const top = live[0];
  if (live.length === 1) {
    return {
      top, exposed: true,
      says: `Everything is ${top.name}. That is not a criticism — plenty of good businesses are one sector — but it does mean one relationship decides the year.`,
    };
  }
  if (top.share >= TOO_CONCENTRATED) {
    return {
      top, exposed: true,
      says: `${Math.round(top.share * 100)}% of won work is ${top.name}. Four names on the letterhead and one of them paying for everything is the shape that hurts — worth knowing before somebody else decides it for you.`,
    };
  }
  return {
    top, exposed: false,
    says: `Best spread across ${live.length} sectors, ${top.name} the largest at ${Math.round(top.share * 100)}%.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Is each sector still being fed?
 * ───────────────────────────────────────────────────────────────────────────── */

export type Feeding = 'fed' | 'thin' | 'starving' | 'quiet';

export interface SectorFeed {
  sectorId: string;
  name: string;
  /** Won work finishing in the window ahead. */
  endingCents: number;
  /** Work being quoted that could replace it. */
  quotingCents: number;
  /** Quoting against ending. Above 1 the sector is growing. */
  cover: number;
  state: Feeding;
  says: string;
}

/** Below this much cover, a sector is shrinking whether or not anybody has noticed. */
export const THIN_COVER = 1;
export const STARVING_COVER = 0.5;

/**
 * The question the total cannot answer: is EACH sector still being fed?
 *
 * Cover is what is being quoted against what is finishing. A business does not need every sector
 * above one — deliberately winding one down is a decision, not a fault. What it needs is to know
 * which way each one is going while there is still time to do something, because a sector takes
 * about as long to restart as it took to go quiet.
 */
export function feeding(
  sectors: readonly Sector[],
  ending: Record<string, number>,
  quoting: Record<string, number>,
): SectorFeed[] {
  return sectors.map(s => {
    const endingCents = ending[s.id] ?? 0;
    const quotingCents = quoting[s.id] ?? 0;

    if (endingCents === 0 && quotingCents === 0) {
      return {
        sectorId: s.id, name: s.name, endingCents, quotingCents, cover: 0, state: 'quiet' as const,
        says: `Nothing finishing and nothing being quoted. ${s.name} is not running at the moment.`,
      };
    }
    if (endingCents === 0) {
      return {
        sectorId: s.id, name: s.name, endingCents, quotingCents, cover: Infinity, state: 'fed' as const,
        says: `Nothing finishing, and work being quoted. ${s.name} is growing.`,
      };
    }
    const cover = quotingCents / endingCents;
    if (cover < STARVING_COVER) {
      return {
        sectorId: s.id, name: s.name, endingCents, quotingCents, cover, state: 'starving' as const,
        says: `Only ${Math.round(cover * 100)}% of what is finishing is being replaced. ${s.name} runs out unless something is quoted now — and a sector takes about as long to restart as it took to go quiet.`,
      };
    }
    if (cover < THIN_COVER) {
      return {
        sectorId: s.id, name: s.name, endingCents, quotingCents, cover, state: 'thin' as const,
        says: `${Math.round(cover * 100)}% cover. ${s.name} is shrinking slowly, which is the kind nobody notices.`,
      };
    }
    return {
      sectorId: s.id, name: s.name, endingCents, quotingCents, cover, state: 'fed' as const,
      says: `${Math.round(cover * 100)}% cover. ${s.name} is holding.`,
    };
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Steady against lumpy
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Steadiness {
  maintenanceCents: number;
  projectCents: number;
  /** The share of revenue that will still be there next year without anybody selling anything. */
  steadyShare: number;
  says: string;
}

/**
 * How much of the year is already there before anybody sells anything.
 *
 * This is the number Kris's "steadily" actually means. A business that is all projects starts every
 * January at nought and has to win a year's work in a year; a business with a maintenance base
 * starts part of the way up and only has to win the difference. It is the single biggest difference
 * between a trade business that is stressful to own and one that is not, and most owners have never
 * seen it as a figure.
 *
 * No target is set. What the right share is depends on the markets a business is in, and a number
 * SPEC invented would be a number somebody optimises against for no reason.
 */
export function steadiness(jobs: readonly SectorJob[]): Steadiness {
  const won = jobs.filter(j => j.won);
  const maintenanceCents = won.filter(j => j.kind === 'maintenance').reduce((n, j) => n + j.valueCents, 0);
  const projectCents = won.filter(j => j.kind && isProjectLike(j.kind)).reduce((n, j) => n + j.valueCents, 0);
  const total = maintenanceCents + projectCents;
  const steadyShare = total > 0 ? maintenanceCents / total : 0;

  if (total === 0) return { maintenanceCents, projectCents, steadyShare, says: 'No work recorded against a kind yet.' };
  if (maintenanceCents === 0) {
    return {
      maintenanceCents, projectCents, steadyShare,
      says: 'All of it is project work. Every January starts at nothing, and a year of work has to be won inside the year.',
    };
  }
  return {
    maintenanceCents, projectCents, steadyShare,
    says: `${Math.round(steadyShare * 100)}% of won work is maintenance — the part that is there next year whether or not anybody sells anything.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Shutdowns
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Shutdown {
  id: string;
  title: string;
  sectorId: string | null;
  /** The window. It does not move. */
  startsAt: string;
  endsAt: string;
  /** People needed across the window, as the business has planned it. */
  crewNeeded: number;
  crewConfirmed: number;
  /** Whether everything that has to be on site before the window opens has been ordered. */
  materialsOrdered: boolean;
}

/**
 * How long before a shutdown things stop being fixable.
 *
 * Six weeks is when ordering and crewing have to be settled, because the window opening with
 * something missing cannot be recovered afterwards — the plant starts again on its date whether the
 * work is finished or not, and what is left undone waits for the next shutdown a year away.
 */
export const SHUTDOWN_LOCK_DAYS = 42;

export interface ShutdownWatch {
  shutdown: Shutdown;
  daysOut: number;
  ready: boolean;
  missing: string[];
  says: string;
}

export function shutdownWatch(s: Shutdown, at: Date = new Date()): ShutdownWatch {
  const daysOut = Math.ceil((Date.parse(s.startsAt) - at.getTime()) / 86_400_000);
  const missing: string[] = [];
  if (s.crewConfirmed < s.crewNeeded) {
    missing.push(`${s.crewNeeded - s.crewConfirmed} of ${s.crewNeeded} crew not confirmed`);
  }
  if (!s.materialsOrdered) missing.push('materials not all ordered');
  const ready = missing.length === 0;

  if (daysOut < 0) {
    return { shutdown: s, daysOut, ready, missing, says: ready ? 'Under way.' : `Under way with ${missing.join(' and ')}.` };
  }
  if (ready) {
    return { shutdown: s, daysOut, ready, missing, says: `${daysOut} days out and everything is set.` };
  }
  if (daysOut <= SHUTDOWN_LOCK_DAYS) {
    return {
      shutdown: s, daysOut, ready, missing,
      says: `${daysOut} days out with ${missing.join(' and ')}. Inside six weeks this stops being something that can be caught up — the window opens on its date either way.`,
    };
  }
  return { shutdown: s, daysOut, ready, missing, says: `${daysOut} days out. Still to settle: ${missing.join(' and ')}.` };
}
