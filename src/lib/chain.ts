/**
 * Chain of responsibility: pick an obligation, and see who actually carries it.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"shown ON THE ORG CHART. Pick an obligation (vehicles and loads, fatigue and hours, working at
 * heights, electrical isolation, asbestos, confined spaces, subbie safety, site inductions,
 * psychosocial wellbeing) and the chart highlights every link with its duty; everyone else dims. ...
 * A link with no named owner (or whose owner left) shows red; the next person up the chain is told
 * AND it goes on the weekly meeting agenda."*
 *
 * ── Why this belongs on the chart and nowhere else ───────────────────────────────────────────────
 *
 * Every business has an obligations register. It is a spreadsheet, it lists duties, and it is
 * reviewed once a year by somebody who was not in the room when the duties were assigned. What it
 * cannot show — and what the chart shows immediately — is the SHAPE of a duty: that seven people
 * carry part of working at heights and the one in the middle of them is vacant.
 *
 * A duty is not a box ticked by one person. It runs from the director who has to resource it, down
 * through whoever plans the work, to the person on the roof. Drawing it on the chart is the only
 * way to see that a link is missing, because a missing link looks exactly like a full register.
 *
 * ── The red link is the whole feature ────────────────────────────────────────────────────────────
 *
 * A seat in a chain with nobody in it is not a gap in a chart. It is a legal duty nobody is
 * discharging, and it is usually invisible because the work still gets done — somebody covers,
 * informally, and everybody assumes somebody else is accountable. The chart makes it red, tells the
 * next person UP the chain (not down: the duty has risen to them whether they like it or not), and
 * puts it on the weekly meeting so it is discussed rather than noticed.
 */

export type ObligationKey =
  | 'vehicles' | 'fatigue' | 'heights' | 'isolation' | 'asbestos'
  | 'confined' | 'subbies' | 'inductions' | 'psychosocial';

export interface Obligation {
  key: ObligationKey;
  label: string;
  /** What the duty actually is, in the words somebody would use to explain it on site. */
  is: string;
  /** What goes wrong when a link in it is empty. Concrete, never "increased risk". */
  ifBroken: string;
}

/** The nine. Kris's list, in his order. */
export const OBLIGATIONS: Obligation[] = [
  {
    key: 'vehicles', label: 'Vehicles and loads',
    is: 'The utes are roadworthy, loaded safely and driven by people licensed to drive them.',
    ifBroken: 'An unsecured load is the business’s duty, not the driver’s alone — and the chain reaches the person who set the schedule that made it a rush.',
  },
  {
    key: 'fatigue', label: 'Fatigue and hours',
    is: 'Nobody is working hours that make them a danger to themselves or anybody else.',
    ifBroken: 'The fourteen-hour day looks like commitment right up until the drive home.',
  },
  {
    key: 'heights', label: 'Working at heights',
    is: 'Anybody above two metres has the training, the equipment and somebody who checked it.',
    ifBroken: 'It is the fall that kills people in this trade more than the electricity does.',
  },
  {
    key: 'isolation', label: 'Electrical isolation',
    is: 'Nothing is worked on live, isolation is proven, and the person proving it is competent to.',
    ifBroken: 'A test that says dead on a circuit that is not is the one failure with no second chance.',
  },
  {
    key: 'asbestos', label: 'Asbestos',
    is: 'Anybody opening up an old building knows what is behind the wall before they cut it.',
    ifBroken: 'The harm arrives thirty years later and nobody can undo it by then.',
  },
  {
    key: 'confined', label: 'Confined spaces',
    is: 'Entry is permitted, atmosphere tested, and somebody is outside watching.',
    ifBroken: 'The second body is usually the person who went in after the first one.',
  },
  {
    key: 'subbies', label: 'Subcontractor safety',
    is: 'A subbie on your site is your duty, whatever the contract says about it.',
    ifBroken: 'Every regulator in the country treats "they were a contractor" as an answer that does not work.',
  },
  {
    key: 'inductions', label: 'Site inductions',
    is: 'Nobody sets foot on a site without knowing its hazards and who to tell.',
    ifBroken: 'An uninducted person on a site is somebody who does not know what is above them.',
  },
  {
    key: 'psychosocial', label: 'Psychosocial wellbeing',
    is: 'The work itself is not making people unwell — load, bullying, isolation, job security.',
    ifBroken: 'It is a duty under the same Act as the physical ones, and the one most businesses have never assigned.',
  },
];

export const obligationByKey = (key: string): Obligation | undefined =>
  OBLIGATIONS.find(o => o.key === key);

export const isObligation = (v: string): v is ObligationKey =>
  OBLIGATIONS.some(o => o.key === v);

/* ─────────────────────────────────────────────────────────────────────────────
 * The links in a chain
 * ───────────────────────────────────────────────────────────────────────────── */

export type LinkKey =
  | 'owner' | 'gm' | 'operations' | 'safety' | 'supervisor'
  | 'technician' | 'apprentice' | 'subcontractor' | 'scheduler' | 'office';

export interface LinkKind {
  key: LinkKey;
  label: string;
  /** How high up the chain this link sits. 0 is the top; used to find who is told. */
  height: number;
}

/**
 * The ten links, ordered by height.
 *
 * Height is what makes "tell the next person up" computable. It is not seniority in general — it is
 * position in a duty chain, which is why a scheduler sits above a technician here: on a fatigue or
 * a vehicles duty, the person who decided the day is further up the chain than the person who drove
 * it, whatever the org chart says about who reports to whom.
 */
export const LINKS: LinkKind[] = [
  { key: 'owner', label: 'Owner or director', height: 0 },
  { key: 'gm', label: 'General manager', height: 1 },
  { key: 'operations', label: 'Operations manager', height: 2 },
  { key: 'safety', label: 'Safety and compliance lead', height: 2 },
  { key: 'scheduler', label: 'Scheduler', height: 3 },
  { key: 'office', label: 'Office manager', height: 3 },
  { key: 'supervisor', label: 'Site supervisor', height: 4 },
  { key: 'technician', label: 'Technician', height: 5 },
  { key: 'subcontractor', label: 'Subcontractor', height: 5 },
  { key: 'apprentice', label: 'Apprentice', height: 6 },
];

export const linkByKey = (key: string): LinkKind | undefined => LINKS.find(l => l.key === key);

/** One link in one obligation's chain, as the business has it. */
export interface Link {
  obligation: ObligationKey;
  link: LinkKey;
  /** What this link has to do for this obligation. The business's words. */
  duty: string;
  /** The seat on the chart that carries it. */
  roleId: string | null;
  roleTitle: string | null;
  /** Who is in that seat. Null when the seat is empty or the person has left. */
  person: string | null;
  /** True when somebody WAS in it and has gone — a different and worse state than never filled. */
  leftAt: string | null;
}

export type LinkState = 'held' | 'vacant' | 'left' | 'unassigned';

export interface LinkWatch {
  link: Link;
  kind: LinkKind;
  state: LinkState;
  says: string;
}

export function linkWatch(link: Link): LinkWatch {
  const kind = linkByKey(link.link)!;

  if (!link.roleId) {
    return {
      link, kind, state: 'unassigned',
      says: `Nobody on the chart has been given this. ${kind.label} is a link in this duty and no seat carries it.`,
    };
  }
  if (link.person?.trim()) {
    return { link, kind, state: 'held', says: `${link.person} — ${link.duty}` };
  }
  if (link.leftAt) {
    /*
      Worse than never filled, and said so. A duty that somebody used to discharge is one everybody
      still believes is being discharged — the work carries on, somebody covers informally, and the
      first time anybody checks is after something has happened.
    */
    return {
      link, kind, state: 'left',
      says: `${link.roleTitle} carried this and left on ${link.leftAt.slice(0, 10)}. Everybody still thinks it is covered.`,
    };
  }
  return {
    link, kind, state: 'vacant',
    says: `${link.roleTitle} carries this and the seat is empty.`,
  };
}

export const isBroken = (s: LinkState): boolean => s !== 'held';

/**
 * Who has to be told about a broken link.
 *
 * The next person UP, not down. A duty does not disappear because the seat that held it is empty —
 * it rises, and the person above is carrying it right now whether they know it or not. Telling
 * somebody below would be asking them to cover, which is exactly the informal arrangement that made
 * the gap invisible in the first place.
 */
export function tellWhom(broken: LinkWatch, all: readonly LinkWatch[]): LinkWatch | null {
  const above = all
    .filter(w => w.kind.height < broken.kind.height && w.state === 'held')
    .sort((a, b) => b.kind.height - a.kind.height);
  return above[0] ?? null;
}

export interface ChainReading {
  obligation: Obligation;
  links: LinkWatch[];
  broken: LinkWatch[];
  /** Every seat that should be lit on the chart. Everything else dims. */
  roleIds: string[];
  says: string;
  /** What goes on the weekly meeting agenda. Null when nothing is broken. */
  forTheMeeting: string | null;
}

export function readChain(obligation: Obligation, links: readonly Link[]): ChainReading {
  const mine = links.filter(l => l.obligation === obligation.key);
  const watches = mine
    .map(linkWatch)
    .sort((a, b) => a.kind.height - b.kind.height);
  const broken = watches.filter(w => isBroken(w.state));
  const roleIds = watches
    .map(w => w.link.roleId)
    .filter((id): id is string => Boolean(id));

  return {
    obligation,
    links: watches,
    broken,
    roleIds,
    says: chainLine(obligation, watches, broken),
    forTheMeeting: forMeeting(obligation, broken, watches),
  };
}

function chainLine(obligation: Obligation, all: readonly LinkWatch[], broken: readonly LinkWatch[]): string {
  if (all.length === 0) {
    return `Nobody has mapped who carries ${obligation.label.toLowerCase()}. Until somebody does, this is a duty the business has and cannot show.`;
  }
  if (broken.length === 0) {
    return `${all.length} links, every one of them held. ${obligation.is}`;
  }
  const left = broken.filter(w => w.state === 'left').length;
  const bits = [`${broken.length} of ${all.length} links not held`];
  if (left > 0) bits.push(`${left} where the person has gone and everybody still thinks it is covered`);
  return `${bits.join(' · ')}. ${obligation.ifBroken}`;
}

/**
 * The line that goes on the weekly meeting agenda.
 *
 * Named people and a named duty, because "review chain of responsibility" is an agenda item that
 * gets carried forward for four months.
 */
function forMeeting(
  obligation: Obligation,
  broken: readonly LinkWatch[],
  all: readonly LinkWatch[],
): string | null {
  if (broken.length === 0) return null;
  const first = broken[0];
  const up = tellWhom(first, all);
  const who = up ? `${up.link.person} is carrying it in the meantime` : 'nobody above it is holding it either';
  const more = broken.length > 1 ? ` (${broken.length - 1} more link${broken.length > 2 ? 's' : ''} in the same duty)` : '';
  return `${obligation.label}: ${first.kind.label} is not held — ${who}${more}.`;
}

/** Every obligation with something broken in it. What a leader opens the chart to find. */
export function brokenChains(
  links: readonly Link[],
): ChainReading[] {
  return OBLIGATIONS
    .map(o => readChain(o, links))
    .filter(r => r.broken.length > 0 || r.links.length === 0)
    .sort((a, b) => b.broken.length - a.broken.length);
}

export const WHY_ON_THE_CHART =
  'A register lists duties. The chart shows their shape — that seven people carry part of working at heights and the one in the middle is vacant. A missing link looks exactly like a full register until you draw it.';

export const DUTY_RISES =
  'When a link is not held, the duty does not disappear. It rises to the person above, who is carrying it right now whether they know it or not — which is why they are the one told.';
