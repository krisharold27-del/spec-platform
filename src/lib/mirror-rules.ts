import type { BoardKind } from './boards-live';

/**
 * The rules an artifact is made to, applied to a mirror.
 *
 * ── Where these come from ────────────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September, after the numbers were made live and the surface was rebuilt as one framed
 * object: *"exactly same as an artifact - bring the same rules claude has for generating an
 * artiifact"*.
 *
 * So these are not invented. They are the rules Claude is held to every time it makes an artifact,
 * written down here as functions a mirror is held to:
 *
 *   1. **The title is a NAME.** Two to four words, and never a name followed by an explainer after a
 *      dash or a colon. The explainer belongs in the description.
 *   2. **The description is one line, and it is separate from the name.** It is what the card says
 *      underneath, and what somebody reads when deciding whether to open the thing.
 *   3. **One short generic signifier for what kind of thing this is** — a plain word, never a
 *      product or a brand.
 *   4. **Everything visible at rest.** An artifact never opens as an empty shell waiting to be
 *      filled: it opens in a real working state, saying something true about itself.
 *   5. **Real content, never placeholder.** Nothing here writes a sentence on somebody's behalf and
 *      leaves it looking like theirs.
 *
 * ── The one place SPEC differs, and why ──────────────────────────────────────────────────────────
 *
 * Claude generating an artifact controls the name AND the description, so it simply writes both
 * well. A person typing into a box controls one field and habitually puts both in it — *"King of the
 * Mountain — Solar Fix Plan"* is the shape everybody reaches for, and both of SPEC's own worked
 * examples were written that way by me.
 *
 * SPEC therefore **splits** rather than refuses: the explainer moves out of the name and becomes the
 * description, and nothing anybody typed is thrown away. What it will not do is invent words. A name
 * that is still too long after the split is a fault it states and hands back, because silently
 * cutting somebody's title to four words is the kind of quiet damage this codebase keeps finding.
 */

/** Four. A name longer than this truncates in the card grid, which is the same as not having one. */
export const NAME_WORDS = 4;

/**
 * Where a person ends the name and starts explaining.
 *
 * An em or en dash counts with or without spaces around it, because "Rate Board—Labour" is the same
 * sentence as "Rate Board — Labour". A plain hyphen and a pipe need spaces on both sides, so that
 * "Follow-up plan" stays one name. A colon needs a space AFTER it, so that "9:30 stand-up" does.
 */
const SEPARATOR = /\s*[—–]\s*|\s+[-|]\s+|:\s+/;

export interface MirrorFault {
  /** Which box the person has to go back to. */
  field: 'name' | 'description';
  /** What is wrong, in words they can act on. */
  said: string;
}

export interface MirrorName {
  /** What the mirror is called. What a room says out loud when it means this thing. */
  name: string;
  /** The one line under it. */
  description: string;
  /** True when the description came out of the title rather than out of the description box. */
  moved: boolean;
  /** What SPEC will not decide on somebody's behalf. Null when the two fields are good. */
  fault: MirrorFault | null;
}

const tidy = (text: string): string => text.trim().replace(/\s+/g, ' ');

const words = (text: string): number => (text ? text.split(' ').length : 0);

/**
 * A line, finished — a capital at the front and a full stop on the end.
 *
 * Only ever applied to an explainer lifted out of somebody's title, where "labour sell rate" wants
 * to read as a sentence. The capital goes on only when the first word is entirely lower case, so
 * that "iPhone rollout" is left alone rather than shouted at: a rule that corrects a name into
 * something nobody wrote is worse than one that leaves a small letter where a capital belongs.
 */
const asLine = (text: string): string => {
  if (!text) return '';
  const [first = ''] = text.split(' ');
  const opened = first === first.toLowerCase() ? text[0].toUpperCase() + text.slice(1) : text;
  return /[.!?]$/.test(opened) ? opened : `${opened}.`;
};

/**
 * Read what somebody typed into the two boxes, and work out the name and the line under it.
 *
 * The split is the whole point: a title with an explainer in it is not a bad title, it is two good
 * fields in one box, and SPEC can tell which is which.
 */
export function readTitle(typed: string, summary: string): MirrorName {
  const whole = tidy(typed);
  const written = tidy(summary);

  const parts = whole.split(SEPARATOR).map(p => p.trim()).filter(Boolean);
  const name = parts[0] ?? '';
  // Everything after the first separator, rejoined — "A — B — C" explains itself in one line.
  const explainer = parts.slice(1).join(' — ');

  const description = written || asLine(explainer);
  const moved = !written && !!explainer;

  return { name, description, moved, fault: faultIn(name, description) };
}

function faultIn(name: string, description: string): MirrorFault | null {
  if (!name) {
    return { field: 'name', said: 'It needs a name. A mirror nobody can find again is not one.' };
  }
  if (words(name) > NAME_WORDS) {
    return {
      field: 'name',
      said: `“${name}” is ${words(name)} words. A mirror's name is what a room calls it out loud —`
        + ` ${NAME_WORDS} words at most. Put the rest in the line underneath, or split it with a dash`
        + ' and SPEC will move it there for you.',
    };
  }
  if (!description) {
    /*
      Required, where it used to say "(optional)".

      This is rule two held to properly rather than politely. A card with a name and a blank line
      under it tells somebody nothing about whether to open the thing, and there is no screen in
      SPEC for editing a mirror's description afterwards — so a blank one stays blank for good.
      SPEC will not write the line itself: an invented sentence under somebody's name reads as
      theirs, which is rule five.
    */
    return {
      field: 'description',
      said: 'It needs one line saying what it is for. That line is what the card shows, and it is'
        + ' how anybody else decides whether to open this.',
    };
  }
  return null;
}

/**
 * The generic word for what kind of thing a mirror is — rule three.
 *
 * One word, always the same word for the same kind, and never a vendor: a mirror built on Xero data
 * is a **Scorecard**, not a "Xero board". The names of the systems underneath belong in the feeds,
 * where they can be checked, rather than in the label a person reads first.
 */
export const SIGNIFIER: Record<BoardKind, string> = {
  live: 'Data',
  plans: 'Plan',
  kpi: 'Scorecard',
  improve: 'Improvement',
  training: 'Training',
  meetings: 'Meeting',
};

export const signifier = (kind: BoardKind): string => SIGNIFIER[kind] ?? 'Mirror';

/**
 * What a mirror of each kind says when there is nothing on it yet — rule four.
 *
 * ── Why this is a rule and not a nicety ──────────────────────────────────────────────────────────
 *
 * An artifact that opens blank has failed before anybody reads it. A brand-new mirror used to open
 * with one heading, the sentence *"Add one below"*, and — when the person had no measures of their
 * own yet — nothing below. A screen that points at something that is not there is worse than a
 * screen that says nothing, because it makes somebody hunt for a control that does not exist.
 *
 * These are SPEC's own words about what the KIND is for, never a pretend example of somebody's
 * content. That distinction is rule five: furniture nobody put there is the thing everybody is
 * afraid to delete.
 */
export const AT_REST: Record<BoardKind, string> = {
  live: 'Nothing is on this yet. A live-data mirror names the systems it reads from and shows what'
    + ' they are saying right now — add a measure below, and connect the system it comes from under'
    + ' Connections.',
  plans: 'No steps yet. A plan is what needs fixing, who owns each piece, and where each one has got'
    + ' to — add the first step below and move it as the team moves it.',
  kpi: 'No measures yet. Put one of your own measures on this and it is read again every time'
    + ' anybody opens it, for whichever month they are looking at.',
  improve: 'Nothing on this yet. An improvement mirror holds the measure somebody wants to move, and'
    + ' the argument about it, in one place the team keeps coming back to.',
  training: 'Nothing on this yet. A training mirror holds what was run, who did it and whether it'
    + ' changed the number it was meant to change.',
  meetings: 'Nothing on this yet. A meeting mirror holds what a meeting decided, so the decisions'
    + ' outlive whoever was taking the notes.',
};

export const atRest = (kind: BoardKind): string => AT_REST[kind] ?? AT_REST.improve;

/**
 * The name in the browser tab when a mirror is opened on its own.
 *
 * `?full=1` is the mirror with SPEC's furniture out of the way, which is the state it is in when a
 * team has it up on a wall. In that state the tab is the only thing left carrying its name — which
 * is exactly what rule one is for.
 */
export const tabName = (name: string): string => tidy(name) || 'Mirror';
