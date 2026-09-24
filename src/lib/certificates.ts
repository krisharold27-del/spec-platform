/**
 * The certificate that proves the work was lawful, and the job it belongs to.
 *
 * ── The one document the job did not hold ────────────────────────────────────────────────────────
 *
 * From the workflow map, 24 September: a job finishes, the customer signs it off on the phone, the
 * invoice goes — and the certificate of compliance is done somewhere else entirely, on a different
 * system or a pad in the ute. So the one document that proves the work was lawful is the one
 * document the job does not have against it, and the first time anybody looks for it is the one
 * time it matters: an insurance claim, a fire, a regulator, a builder's audit, or a sale of the
 * business where four years of them have to be produced at once.
 *
 * Nothing here is clever. The value is that it lives on the job, is asked for at the moment the
 * work is finished, and is visibly missing until it is not.
 *
 * ── SPEC does not know what it is called where you are, and says so ──────────────────────────────
 *
 * Every state and territory runs its own scheme, under its own name, lodged with its own body,
 * inside its own window — and they change. `lib/apprentice-funding` set the rule for exactly this
 * situation and it applies here with more force, because this one is legal rather than financial:
 *
 *   **A number SPEC invented and showed as the deadline is worse than no deadline**, because a
 *   business that lodges to SPEC's made-up window instead of the real one has been actively misled
 *   by the thing it trusted to keep it right.
 *
 * So there is not a single day count in this file, and `tests/certificates.test.ts` fails the build
 * if one ever appears. The window is the business's own, set once, from whatever their regulator
 * actually says. Until they set it, SPEC tracks that the certificate is outstanding and refuses to
 * guess when it is late.
 *
 * The same goes for the name. `SUGGESTED_NAME` below is a starting point to save typing, offered
 * and never applied — the business confirms what theirs is called, the way `EXAMPLE_STREAMS` is
 * offered without being applied in `lib/sectors`.
 *
 * ── Not only electricians ────────────────────────────────────────────────────────────────────────
 *
 * Plumbing, gas and fire all have their own certificate of the same shape. Nothing here is
 * electrical, which is why the business names it rather than SPEC naming it for them.
 */

/** The eight. The only thing in this file SPEC is certain of. */
export const TERRITORIES = [
  { code: 'NSW', name: 'New South Wales' },
  { code: 'VIC', name: 'Victoria' },
  { code: 'QLD', name: 'Queensland' },
  { code: 'WA', name: 'Western Australia' },
  { code: 'SA', name: 'South Australia' },
  { code: 'TAS', name: 'Tasmania' },
  { code: 'NT', name: 'Northern Territory' },
  { code: 'ACT', name: 'Australian Capital Territory' },
] as const;

export type Territory = (typeof TERRITORIES)[number]['code'];

export const isTerritory = (v: string): v is Territory =>
  TERRITORIES.some(t => t.code === v);

export const territoryName = (code: string): string =>
  TERRITORIES.find(t => t.code === code)?.name ?? code;

/**
 * What an electrical certificate is commonly called in each state — a starting point, not an answer.
 *
 * Offered so nobody types it from scratch, and never applied on anybody's behalf. A business
 * confirms it, corrects it, or replaces it entirely with whatever their trade and their regulator
 * actually call it, and from that moment SPEC uses their words.
 *
 * `CONFIRM_THE_NAME` goes beside it wherever it is shown, because a suggestion presented as a fact
 * is a fact as far as the person reading it is concerned.
 */
export const SUGGESTED_NAME: Record<Territory, string> = {
  NSW: 'Certificate of Compliance Electrical Work',
  VIC: 'Certificate of Electrical Safety',
  QLD: 'Certificate of Testing and Safety',
  WA: 'Electrical Safety Certificate',
  SA: 'Certificate of Compliance',
  TAS: 'Certificate of Electrical Compliance',
  NT: 'Certificate of Compliance',
  ACT: 'Certificate of Electrical Safety',
};

export const CONFIRM_THE_NAME =
  'A starting point only — check it against your own regulator and change it to whatever yours is actually called. SPEC uses your words from then on.';

export const WHY_THE_WINDOW_IS_YOURS =
  'How long you have to lodge it differs by state and by trade, and it changes. SPEC will not guess: set it from what your regulator says and it will hold you to that. Leave it blank and SPEC still tracks the certificate — it just will not tell you something is late when it does not know.';

/* ─────────────────────────────────────────────────────────────────────────────
 * What the business sets, once
 * ───────────────────────────────────────────────────────────────────────────── */

export interface CertificateSetup {
  /** Where the business mainly works. Used to offer a name, never to decide the window. */
  territory: Territory | null;
  /** What the business calls it. Their words. */
  name: string | null;
  /**
   * Days to lodge, from the business's own regulator. Null means nobody has said.
   *
   * Null is a real state and not a missing one. It is the difference between "you have two days
   * left" and "this is still outstanding, and I do not know your deadline" — the second is honest,
   * and the first, invented, is the failure this whole file is written around.
   */
  withinDays: number | null;
}

export const isSetUp = (s: CertificateSetup): boolean => Boolean(s.name?.trim());

/* ─────────────────────────────────────────────────────────────────────────────
 * One job's certificate
 * ───────────────────────────────────────────────────────────────────────────── */

export interface CertifiableJob {
  id: string;
  ref: string;
  stage: string;
  /** Set when the business says this job does not need one. */
  noCertificateBecause?: string | null;
  certificateRef?: string | null;
  certificateIssuedAt?: string | null;
  certificateLodgedAt?: string | null;
  /** When the work was finished — what the window is counted from. */
  doneAt?: string | null;
}

export type CertState =
  | 'not_yet'        // the work is not finished, so nothing is owed
  | 'excused'        // the business has said this one does not need it, and why
  | 'due'            // finished, nothing issued
  | 'issued'         // written, not yet lodged
  | 'lodged'         // done
  | 'late';          // past the business's own window

/** The stages at which a certificate starts being owed. Finished work, whether or not it is billed. */
export const FINISHED_STAGES = ['invoiced', 'paid'] as const;

export const isFinished = (stage: string): boolean =>
  (FINISHED_STAGES as readonly string[]).includes(stage);

export interface CertWatch {
  job: CertifiableJob;
  state: CertState;
  /** Days since the work was finished. Null when it is not finished, or no date was kept. */
  daysSince: number | null;
  says: string;
}

export function certWatch(
  job: CertifiableJob,
  setup: CertificateSetup,
  at: Date = new Date(),
): CertWatch {
  const what = setup.name?.trim() || 'The certificate';

  if (job.noCertificateBecause?.trim()) {
    return {
      job, state: 'excused', daysSince: null,
      says: `Not needed — ${job.noCertificateBecause.trim()}`,
    };
  }
  if (job.certificateLodgedAt) {
    return { job, state: 'lodged', daysSince: null, says: `${what} lodged ${job.certificateLodgedAt.slice(0, 10)}.` };
  }
  if (!isFinished(job.stage)) {
    return { job, state: 'not_yet', daysSince: null, says: 'The work is not finished yet.' };
  }

  const from = job.doneAt ? Date.parse(job.doneAt) : NaN;
  const daysSince = Number.isFinite(from) ? Math.floor((at.getTime() - from) / 86_400_000) : null;

  if (job.certificateIssuedAt) {
    /*
      Written but not lodged. The gap people fall into: the customer has their copy, everybody
      believes it is done, and the body that has to receive it never did.
    */
    if (setup.withinDays !== null && daysSince !== null && daysSince > setup.withinDays) {
      return {
        job, state: 'late', daysSince,
        says: `${what} was written but never lodged, and that is ${daysSince} days — past the ${setup.withinDays} you set.`,
      };
    }
    return {
      job, state: 'issued', daysSince,
      says: `${what} is written. It still has to be lodged — the customer having their copy is not the same thing.`,
    };
  }

  if (setup.withinDays !== null && daysSince !== null && daysSince > setup.withinDays) {
    return {
      job, state: 'late', daysSince,
      says: `No ${what.toLowerCase()} ${daysSince} days after the work was finished, past the ${setup.withinDays} you set.`,
    };
  }
  /*
    Outstanding with no window set. Said as what it is — SPEC does not know the deadline — rather
    than dressed up as a countdown, because an invented countdown is the one thing this must not do.
  */
  return {
    job, state: 'due', daysSince,
    says: setup.withinDays === null
      ? `${what} is outstanding. SPEC does not know your lodgement window, so it will not tell you whether this is late — set it once and it will.`
      : `${what} is outstanding.`,
  };
}

/** Still owed: the job is finished and the paperwork that makes it lawful is not done. */
export const stillOwed = (s: CertState): boolean =>
  s === 'due' || s === 'issued' || s === 'late';

/**
 * A job is not finished until this is.
 *
 * Not a block on invoicing, deliberately. A business that cannot bill because of a paperwork flag
 * will stop using the flag, then stop using the screen, then keep its certificates somewhere SPEC
 * cannot see — which is exactly where they are now. It is loud, it is counted, and it is on the
 * compliance register, and that is a great deal more than a pad in a ute.
 */
export function outstanding(
  jobs: readonly CertifiableJob[],
  setup: CertificateSetup,
  at: Date = new Date(),
): CertWatch[] {
  return jobs
    .map(j => certWatch(j, setup, at))
    .filter(w => stillOwed(w.state))
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
}

export function certificateLine(watches: readonly CertWatch[], setup: CertificateSetup): string {
  if (!isSetUp(setup)) {
    return 'Nobody has told SPEC what your certificate of compliance is called. Set it once and every finished job will ask for it.';
  }
  const owed = watches.filter(w => stillOwed(w.state));
  if (owed.length === 0) return 'Every finished job has its certificate lodged.';
  const late = owed.filter(w => w.state === 'late').length;
  const written = owed.filter(w => w.state === 'issued').length;
  const bits = [`${owed.length} finished ${owed.length === 1 ? 'job has no certificate lodged' : 'jobs have no certificate lodged'}`];
  if (written) bits.push(`${written} written but not sent`);
  if (late) bits.push(`${late} past your own window`);
  return `${bits.join(' · ')}.`;
}
