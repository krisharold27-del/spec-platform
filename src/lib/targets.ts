/**
 * Reading a target out of a template — pure, no I/O.
 *
 * Lives here rather than in lib/provision because provision opens a database connection at import,
 * and every rule in SPEC is meant to be testable without one.
 */

/**
 * A template target is a placeholder, not a number.
 *
 * The seed writes `{utilisation_target, default 85%}`, meaning: this is the business's to decide,
 * and 85% is a sensible opening. Left alone it renders as a variable name leaking through the UI,
 * which looks broken and says the opposite of what it means.
 *
 * So it is split the way the product actually works. The DEFAULT becomes the proposed target — SPEC
 * proposes, the leader edits — and the agreed target stays empty until somebody agrees it. A
 * placeholder with no default proposes nothing, because inventing a number for a business SPEC
 * knows nothing about is the one thing it must never do.
 */
export function resolveTarget(raw: string | undefined | null): { target: string | null; proposed: string | null } {
  const value = raw?.trim();
  if (!value) return { target: null, proposed: null };
  const placeholder = value.match(/^\{([^}]*)\}$/);
  if (!placeholder) return { target: value, proposed: value };
  const fallback = placeholder[1].match(/default\s+(.+)$/i);
  return { target: null, proposed: fallback ? fallback[1].trim() : null };
}

/** What a target reads as before anybody has agreed one. Never a blank, and never a variable name. */
export const targetLabel = (target: string | null, proposed: string | null): string =>
  target ?? (proposed ? `${proposed} proposed, not yet agreed` : 'Not set yet');
