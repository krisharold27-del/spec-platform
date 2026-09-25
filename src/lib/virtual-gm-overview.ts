import type { PowerReading, SlotReading } from './power-meter';
import {
  WORKFLOWS, FAMILIES, inFamily, movedBy, placeOf, screensOf, tally,
  type FamilyKey, type SlotId, type Workflow,
} from './workflows';
import { STATUS_LABEL } from './systems';

/**
 * The Virtual GM — the whole business on one screen, reached as a door from My Page.
 *
 * Pure: everything this page decides is decided here, and nothing here is a second copy of a number
 * that lives somewhere else.
 *
 *   The dial and its breakdown are `lib/power-meter`'s own reading, handed in whole. This file never
 *   scores anything, so the Virtual GM and My Page cannot disagree about the business.
 *
 *   The levers are the slots that reading marked NOT MET, each joined to the workflows `lib/workflows`
 *   already says move that slot. No lever is written by hand — a slot with nothing marked against it
 *   produces no lever, and a lever always names a workflow and a screen that exist.
 *
 *   The coverage grid is `FAMILIES` from `lib/workflows`, counted — the same seven the Workflows page
 *   draws, and nothing added.
 *
 *   The financial panel reads the business's own connection rows. Angus Shield is named plainly as
 *   SPEC's own financial system and as not switchable yet, because that is the position.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Levers to pull this week
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Fix {
  workflowId: string;
  /** The workflow's own name, from `lib/workflows`. */
  name: string;
  /** The screen it starts on — its first step that has a home. */
  href: string;
  /** Which of the seven families it sits in, in the family's own words. */
  family: string;
}

export interface Lever {
  slotId: string;
  /** The framework's name for the measure. */
  name: string;
  weight: 'heavy' | 'shared';
  /** What went wrong, in the business's own figures — the reading's own `cause`. */
  cause: string;
  /** The workflows that move this measure. Never empty — see `levers`. */
  fixes: Fix[];
}

const familyLabel = (key: FamilyKey): string => FAMILIES.find(f => f.key === key)?.label ?? key;

/** Where a workflow starts: the first step that has a screen. Null only for a workflow with none. */
export const startOf = (w: Workflow): string | null => screensOf(w)[0] ?? null;

/** The workflows that fix a measure, each with the screen it starts on. */
export function fixesFor(slotId: string, list: readonly Workflow[] = WORKFLOWS): Fix[] {
  return movedBy(slotId as SlotId, list).flatMap(w => {
    const href = startOf(w);
    return href ? [{ workflowId: w.id, name: w.name, href, family: familyLabel(w.family) }] : [];
  });
}

/**
 * Every measure the Power Meter marked not met, heaviest first, each with what fixes it.
 *
 * Only NOT MET. A slot nobody has measured yet costs points on the dial, and the breakdown says so,
 * but it is a KPI to set rather than a lever to pull — calling it a lever would invent a failure
 * nobody recorded. Heavy hitters lead because each one is fifteen points; within a weight the
 * framework's own order holds, never a sort by anything else.
 */
export function levers(reading: PowerReading, list: readonly Workflow[] = WORKFLOWS): Lever[] {
  const missed = (r: SlotReading) => r.state === 'not_met';
  return [...reading.heavy.filter(missed), ...reading.shared.filter(missed)].flatMap(r => {
    const fixes = fixesFor(r.slot.id, list);
    if (!fixes.length) return [];
    return [{
      slotId: r.slot.id,
      name: r.slot.name,
      weight: r.slot.weight,
      cause: r.cause ?? `${r.slot.name} — marked not met`,
      fixes,
    }];
  });
}

/** The line under the heading. A fact about the month, never a pep talk. */
export function leversLine(found: readonly Lever[], period: string | null): string {
  if (!period) return 'Nothing has been marked yet, so nothing is marked not met.';
  if (!found.length) return 'Nothing is marked not met this month.';
  const heavy = found.filter(l => l.weight === 'heavy').length;
  const n = found.length;
  const said = `${n} ${n === 1 ? 'measure is' : 'measures are'} marked not met`;
  return heavy ? `${said} — ${heavy} of them a heavy hitter.` : `${said}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Everything the business needs, one login
 * ───────────────────────────────────────────────────────────────────────────── */

export interface FamilyTile {
  key: FamilyKey;
  label: string;
  blurb: string;
  total: number;
  whole: number;
  partial: number;
  /** The screen this family happens on most — where the tile opens. */
  href: string;
}

/** The screen a family's steps land on most often. Ties go to whichever appears first. */
function homeOf(list: readonly Workflow[]): string {
  const count = new Map<string, number>();
  for (const w of list) for (const s of w.steps) if (s.where) count.set(placeOf(s.where), (count.get(placeOf(s.where)) ?? 0) + 1);
  let best = '/workflows';
  let most = 0;
  for (const [place, n] of count) if (n > most) { best = place; most = n; }
  return best;
}

/** The seven families, each counted from the map. Nothing on a tile is typed in. */
export function coverageGrid(list: readonly Workflow[] = WORKFLOWS): FamilyTile[] {
  return FAMILIES.map(f => {
    const mine = inFamily(f.key, list);
    const t = tally(mine);
    return { key: f.key, label: f.label, blurb: f.blurb, ...t, href: homeOf(mine) };
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Your financial system
 * ───────────────────────────────────────────────────────────────────────────── */

/** SPEC's own financial system. Named, and honest that nobody can switch to it yet. */
export const ANGUS_SHIELD = {
  name: 'Angus Shield',
  line: 'Angus Shield is SPEC’s own financial system. It is not switchable yet — your books stay in the accounting system you already use, and SPEC reads from it rather than replacing it.',
  switchable: false,
} as const;

/** One of the business's own connections in the financials category, as the page needs it. */
export interface LedgerConnection {
  name: string;
  status: string;
  /** Set once the business has consented and a credential is held. */
  linked: boolean;
  /** Which set of books, once chosen. Null while the administrator still has to pick. */
  orgName: string | null;
}

export type LedgerState = 'none' | 'named' | 'choose' | 'linked' | 'broken';

export interface LedgerPanel {
  state: LedgerState;
  /** The system as the business named it. Null when there is none. */
  name: string | null;
  says: string;
  /** Where the next step happens. */
  href: string;
  action: string;
}

/**
 * What the business's accounting connection actually is, said plainly.
 *
 * The strongest connection wins when there is more than one — linked, then waiting on a choice of
 * books, then named, then broken — so a business that tried twice is shown the attempt that worked.
 */
export function ledgerPanel(connections: readonly LedgerConnection[]): LedgerPanel {
  const rank = (c: LedgerConnection): number =>
    c.status === 'broken' ? 3 : c.linked && c.orgName ? 0 : c.linked ? 1 : 2;
  const [best] = [...connections].sort((a, b) => rank(a) - rank(b));
  const manage = '/connections?category=financials';

  if (!best) {
    return {
      state: 'none', name: null, href: manage, action: 'Connect your accounting system',
      says: 'No accounting system is connected, so every earnings number is marked by hand. That is a complete way to run SPEC.',
    };
  }
  if (best.status === 'broken') {
    return {
      state: 'broken', name: best.name, href: '/connections', action: 'Reconnect it',
      says: `${best.name} needs reconnecting. Until it is, earnings numbers are marked by hand.`,
    };
  }
  if (best.linked && best.orgName) {
    return {
      state: 'linked', name: best.name, href: '/connections', action: 'Manage the connection',
      says: `${best.name} is linked to ${best.orgName}. SPEC reads it and never writes to it — your accountant, your bank and the tax office keep working from the same books.`,
    };
  }
  if (best.linked) {
    return {
      state: 'choose', name: best.name, href: '/connections', action: 'Choose the books',
      says: `${best.name} is linked, and which set of books is this business’s is still to be chosen. Nothing is read until it is.`,
    };
  }
  return {
    state: 'named', name: best.name, href: '/connections', action: 'Finish connecting it',
    says: `${best.name} is named as your accounting system — ${(STATUS_LABEL[best.status] ?? best.status).toLowerCase()}.`,
  };
}
