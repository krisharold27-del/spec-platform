import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { noteFor, byClosestToPaying, type AceWatchRow } from '../src/lib/ace-watch';
import { combinedScore } from '../src/lib/scoring';

/*
  ── Ace watch: every role's run, where the month is signed off ───────────────────────────────────

  Kris: "add an Ace to each role - scored when the person hits 3 months in a row - resets and then
  begins the 3 month focus again."

  The Ace was real but private — it only rendered on the one scorecard whose roleId was in the URL.
  The person on their third month could see it; the director approving the doubled payment could
  not see it anywhere at all. The design has carried "Ace watch" on Monthly Scoring since the first
  export, and the product did not have it.

  What is tested here is the part somebody READS. The note is the whole value of the section: a
  count is not an answer, and "1 of 3" tells a manager nothing they can do anything about.
*/

const watch = readFileSync('src/components/ace-watch.tsx', 'utf8');
const read = readFileSync('src/lib/ace-watch-data.ts', 'utf8');
const scoring = readFileSync('src/app/scoring/page.tsx', 'utf8');
const board = readFileSync('src/app/board/[periodId]/page.tsx', 'utf8');

const month = (period: string, s: number | null, p: number | null, e: number | null, c: number | null) => {
  const pillars = { safety: s, people: p, earnings: e, compliance: c };
  return { period, pillars, combined: combinedScore(pillars) };
};

const row = (over: Partial<AceWatchRow>): AceWatchRow => ({
  roleId: 'r', roleTitle: 'Role', person: null, aceName: 'Ace',
  run: [], consecutive: 0, required: 3, doublesNow: false, blockedBySignoff: false,
  signedOff: true, note: '',
  ...over,
});

describe('Ace watch, where a director can see it', () => {
  it('is on the page the month is scored on, and on the board pack', () => {
    expect(scoring, 'rendered on Monthly scoring').toContain('<AceWatch');
    expect(scoring, 'and fed a real reading').toContain('aceWatch(');
    expect(board, 'rendered on the board pack').toContain('<AceWatch');
    expect(board, 'and fed a real reading').toContain('aceWatch(');
  });

  /*
    A loop calling getScorecard per role per month is 3 queries × roles × months — 720 round trips
    for forty roles and six months. That is the same shape of fault as the missing index that read
    16,008 meeting rows to return 24. This asserts the batch has not quietly been un-batched.
  */
  it('reads each table once rather than once per role-month', () => {
    // The call, not the word — the file's own comment explains why it does NOT call it.
    expect(read, 'no per-role scorecard fetch').not.toContain('getScorecard(');
    expect((read.match(/db\.select\(/g) ?? []).length,
      'four reads: periods, criteria, assessments, assignments').toBeLessThanOrEqual(4);
    expect(read, 'roles and months are fetched in bulk').toContain('inArray');
  });

  it('never widens the set of roles it is given', () => {
    expect(read, 'the caller passes what the viewer may see').toContain('visibleRoleIds');
    expect(scoring, 'and Monthly scoring passes its own scope').toContain('inScope.map(r => r.id)');
  });
});

describe('the note, which is the part a manager acts on', () => {
  const held = month('2026-09', 0.95, 0.95, 0.95, 0.95);

  it('says the incentive is doubled and the focus restarts', () => {
    const note = noteFor({
      state: { consecutive: 0, doublesNow: true, blockedBySignoff: false },
      history: [held, held, held], signedOff: true,
    });
    expect(note).toContain('doubled');
    expect(note, 'and that the count begins again — it is a sprint, not a badge').toContain('starts again');
  });

  it('separates "the numbers are not there" from "the sign-off is not"', () => {
    const blocked = noteFor({
      state: { consecutive: 0, doublesNow: false, blockedBySignoff: true },
      history: [held, held, held], signedOff: false,
    });
    expect(blocked).toContain('the numbers are there');
    expect(blocked).toContain('signed off');

    const untrained = noteFor({
      state: { consecutive: 0, doublesNow: false, blockedBySignoff: false },
      history: [held], signedOff: false,
    });
    expect(untrained, 'the run cannot even start').toContain('cannot start');
  });

  /* The whole point of the section. "1 of 3" is a number; naming the quadrant is a conversation. */
  it('names the quadrant that broke the run', () => {
    const broke = month('2026-09', 0.98, 0.72, 1, 1);
    const note = noteFor({
      state: { consecutive: 0, doublesNow: false, blockedBySignoff: false },
      history: [held, held, broke], signedOff: true,
    });
    expect(note).toContain('People at 72%');
    expect(note).toContain('2026-09');
  });

  it('says how many months are left when a run is building', () => {
    const one = noteFor({
      state: { consecutive: 2, doublesNow: false, blockedBySignoff: false },
      history: [held, held], signedOff: true,
    });
    expect(one).toContain('2 of 3');
    expect(one, 'singular, because "1 more months" is how software sounds').toContain('One more month');
  });

  /* A month nobody scored is not a zero — it is a month nobody marked, and the difference matters
     to the person whose run it broke. */
  it('distinguishes an unscored month from a bad one', () => {
    const blank = month('2026-09', null, null, null, null);
    const note = noteFor({
      state: { consecutive: 0, doublesNow: false, blockedBySignoff: false },
      history: [held, blank], signedOff: true,
    });
    expect(note).toContain('Nothing was scored');
    expect(note).not.toContain('0.0%');
  });

  it('has something to say before any month has closed', () => {
    const note = noteFor({
      state: { consecutive: 0, doublesNow: false, blockedBySignoff: false },
      history: [], signedOff: true,
    });
    expect(note).toContain('No closed months yet');
  });
});

describe('the order, which is the order a director can act in', () => {
  it('puts the money first, then the sign-off somebody can go and do today', () => {
    const rows = [
      row({ roleTitle: 'D', consecutive: 1 }),
      row({ roleTitle: 'C', blockedBySignoff: true }),
      row({ roleTitle: 'A', doublesNow: true }),
      row({ roleTitle: 'B', consecutive: 2 }),
    ];
    expect([...rows].sort(byClosestToPaying).map(r => r.roleTitle)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('is stable between two loads of the same page', () => {
    const rows = [row({ roleTitle: 'Zeta' }), row({ roleTitle: 'Alpha' }), row({ roleTitle: 'Mid' })];
    expect([...rows].sort(byClosestToPaying).map(r => r.roleTitle)).toEqual(['Alpha', 'Mid', 'Zeta']);
  });
});

describe('what the section says out loud', () => {
  it('says every role has one, which is the thing Kris asked for', () => {
    expect(watch).toContain('Every role has one');
  });

  it('says the test is the combined score, not every pillar', () => {
    expect(watch).toContain('combined score');
    expect(watch, 'and that the focus restarts').toContain('three-month focus starts again');
  });

  /* Not being on a run is the ordinary case. Painting it red would make the standard look like a
     failure everybody in the business is at. */
  it('does not paint an ordinary month red', () => {
    expect(watch).not.toContain('LIGHT_COLOUR.red');
    expect(watch).toContain("'pending'");
  });

  it('explains an empty state rather than rendering an empty box', () => {
    expect(watch).toContain('No role has a KPI scorecard yet');
  });

  /*
    One answer per card. Somebody not signed off has months on the board and no run, and a chip
    reading "1 of 3 months" beside a note saying the run cannot start is the card arguing with
    itself — the same fault as a 95% score on a green tile labelled "Watch", which shipped once.
  */
  it('does not put a run count beside a note saying the run cannot start', () => {
    expect(watch).toContain('Not signed off');
    expect(watch, 'the chip reads the sign-off before the count').toContain('!r.signedOff');
  });

  /*
    Caught by looking at the rendered page rather than by a test: a role with two good months and no
    sign-off drew a RUST stripe — the colour for "one more month and this pays" — beside a note
    reading "the run cannot start". The colour has to answer the same question the words do.
  */
  it('does not colour a run amber when that run has not started', () => {
    const from = watch.indexOf('const tone =');
    const tone = watch.slice(from, watch.indexOf('return (', from));
    expect(tone, 'sign-off is checked before the count').toMatch(/!r\.signedOff[\s\S]*'pending'/);
    expect(tone.indexOf('!r.signedOff')).toBeLessThan(tone.indexOf("'amber'"));
  });
});
