import { DEFAULT_CEILINGS } from './incentive';

/**
 * A business's own incentive ceilings.
 *
 * The published ladder — 250, 500, 750, 1,000, 2,000, 4,000 — halves at each step, and that halving
 * is what makes it explainable in a pay conversation. It is a SUGGESTION. designs/the-rules.md is
 * explicit: "Ceilings are defaults, not law."
 *
 * They were not stored anywhere, so every customer was locked to SPEC's numbers — which turns a
 * recommendation into a rule nobody agreed to. A trade business in one state and a services business
 * in another do not pay the same.
 */

/** The ladder, in the order a person climbs it — for showing, not for deciding. */
export const LADDER: { level: string; label: string }[] = [
  { level: 'apprentice', label: 'Apprentice' },
  { level: 'technician', label: 'Technician' },
  { level: 'specialist', label: 'Specialist' },
  { level: 'supervisor', label: 'Supervisor' },
  { level: 'manager', label: 'Senior manager' },
  { level: 'gm', label: 'General manager' },
];

/** Nobody is paid a negative amount, and a ceiling nobody could ever hit is a typo. */
export const MOST_A_CEILING_MAY_BE = 100_000;

/**
 * What this business actually pays against.
 *
 * Merged over the defaults rather than replacing them, so a business that sets one level keeps the
 * ladder for the rest — and a level added to SPEC later does not leave an existing customer with a
 * hole where a ceiling should be.
 *
 * Bad JSON falls back to the ladder rather than throwing. A corrupted setting must not take down the
 * page somebody reads their own pay on.
 */
export function ceilingsFor(stored: string | null | undefined): Record<string, number | null> {
  if (!stored?.trim()) return { ...DEFAULT_CEILINGS };
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const out: Record<string, number | null> = { ...DEFAULT_CEILINGS };
    for (const [level, value] of Object.entries(parsed)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (value < 0 || value > MOST_A_CEILING_MAY_BE) continue;
      out[level] = Math.round(value);
    }
    return out;
  } catch {
    return { ...DEFAULT_CEILINGS };
  }
}

/**
 * Only what differs from the ladder is kept.
 *
 * A business that never touches this stores nothing, so if SPEC ever revises the published ladder
 * they move with it — rather than being frozen on a copy of today's numbers they never chose.
 */
export function ceilingsToStore(entered: Record<string, number>): string | null {
  const changed: Record<string, number> = {};
  for (const [level, value] of Object.entries(entered)) {
    if (!Number.isFinite(value) || value < 0 || value > MOST_A_CEILING_MAY_BE) continue;
    if (DEFAULT_CEILINGS[level] !== Math.round(value)) changed[level] = Math.round(value);
  }
  return Object.keys(changed).length ? JSON.stringify(changed) : null;
}

/** Has this business moved off the published ladder? Shown on the page so it is never a surprise. */
export const usesOwnCeilings = (stored: string | null | undefined): boolean => Boolean(stored?.trim());
