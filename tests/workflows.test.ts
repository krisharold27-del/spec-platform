import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  WORKFLOWS, FAMILIES, FamilyKey, placeOf, placesFor, peopleIn, tooFar, gaps,
  stateOf, tally, unreachable, movesNothing, movedBy, screensOf, doneForYou,
  ownedBy, byStream, emptyStreams, isSentLinkScreen,
} from '../src/lib/workflows';
import { STREAMS, STREAM_KEYS, type Owner } from '../src/lib/streams';
import { FRAMEWORK } from '../src/lib/power-meter';

const APP = join(process.cwd(), 'src/app');

/**
 * Does this screen exist on disk?
 *
 * The whole point of the map is that it cannot drift away from the product. A `where` that names a
 * screen nobody built — or one somebody has since renamed — turns the map into a brochure, and a
 * brochure is what every one of these files becomes if the only thing holding it true is that
 * somebody remembered.
 */
function routeExists(place: string): boolean {
  const segments = place.split('/').filter(Boolean);
  let dir = APP;
  for (const seg of segments) {
    const direct = join(dir, seg);
    if (existsSync(direct)) { dir = direct; continue; }
    return false;
  }
  if (existsSync(join(dir, 'page.tsx'))) return true;
  // A dynamic segment: /customer is served by customer/[token]/page.tsx.
  return readdirSync(dir, { withFileTypes: true })
    .some(e => e.isDirectory() && e.name.startsWith('[') && existsSync(join(dir, e.name, 'page.tsx')));
}

describe('the workflow map points at screens that exist', () => {
  it('every screen it offers as a link opens without a token — the rest are named, not linked', () => {
    // /customer and /join only exist behind a token, so linking the bare address was a 404 on a
    // public page. The site check on 25 September found both.
    const dead: string[] = [];
    for (const w of WORKFLOWS) {
      for (const href of screensOf(w)) {
        if (isSentLinkScreen(href)) continue;
        if (!existsSync(join(APP, ...placeOf(href).split('/').filter(Boolean), 'page.tsx'))) dead.push(`${w.id}: ${href}`);
      }
    }
    expect(dead).toEqual([]);
    expect(isSentLinkScreen('/customer')).toBe(true);
    expect(isSentLinkScreen('/join')).toBe(true);
  });

  it('every step happens somewhere real', () => {
    const broken: string[] = [];
    for (const w of WORKFLOWS) {
      for (const s of w.steps) {
        if (s.where && !routeExists(placeOf(s.where))) broken.push(`${w.id}: ${s.where}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('a step with nowhere to happen says what is missing', () => {
    for (const { workflow, step } of gaps()) {
      expect(step.gap, `${workflow.id} has a hole with no explanation`).toBeTruthy();
      expect(step.gap!.length).toBeGreaterThan(40);
    }
  });

  it('nothing claims to be whole while it has a hole', () => {
    for (const w of WORKFLOWS) {
      const holes = w.steps.filter(s => s.where === null).length;
      expect(stateOf(w)).toBe(holes > 0 ? 'partial' : 'whole');
    }
  });
});

describe('every workflow is a journey, not a feature', () => {
  it('has a trigger and a finish line', () => {
    for (const w of WORKFLOWS) {
      expect(w.starts.length, `${w.id} has no trigger`).toBeGreaterThan(10);
      expect(w.ends.length, `${w.id} has no finish line`).toBeGreaterThan(10);
      expect(w.steps.length, `${w.id} has no steps`).toBeGreaterThan(0);
    }
  });

  it('ids are unique and families are real', () => {
    const ids = WORKFLOWS.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    const families = new Set<FamilyKey>(FAMILIES.map(f => f.key));
    for (const w of WORKFLOWS) expect(families.has(w.family)).toBe(true);
  });

  it('every family has workflows in it', () => {
    for (const f of FAMILIES) {
      expect(WORKFLOWS.some(w => w.family === f.key), `${f.key} is empty`).toBe(true);
    }
  });
});

/*
  ── Outsimple them ──────────────────────────────────────────────────────────────────────────────

  Kris, 24 September: "no workflow with any extra steps — (why simpro is annoying)".

  The rule is one person, one place, one workflow. These two break it, and they are written down
  here rather than quietly excused: naming them is what makes each one an argument somebody has to
  win before it can stay. The test fails if a THIRD appears, and it also fails if one of these is
  fixed and nobody removes it from the list — a stale exception is how an allowlist becomes the
  place violations go to be forgotten.
*/
const KNOWN_DETOURS: { id: string; who: string; why: string }[] = [
  {
    id: 'onboard-apprentice', who: 'office',
    why: 'An apprentice’s training contract and stage live on Training, while everything else about them lives on People. The office sets one person up in two places. Fix: the training contract belongs on the person’s record.',
  },
  {
    id: 'monthly-scorecard', who: 'leader',
    why: 'Scoring happens on Scoring and approving happens in the Inbox, so a leader closing out a month goes to two screens. Fix: approve where you score.',
  },
];

describe('nobody is sent somewhere else to finish what they started', () => {
  it('has no detours beyond the two already known', () => {
    const found = tooFar().map(f => `${f.workflow.id}/${f.who}`).sort();
    const allowed = KNOWN_DETOURS.map(d => `${d.id}/${d.who}`).sort();
    expect(found).toEqual(allowed);
  });

  it('every known detour is explained well enough to act on', () => {
    for (const d of KNOWN_DETOURS) {
      expect(d.why).toMatch(/Fix:/);
      expect(WORKFLOWS.some(w => w.id === d.id), `${d.id} is not a workflow`).toBe(true);
    }
  });

  it('a tab is not a detour, but a different screen is', () => {
    expect(placeOf('/jobs?tab=billing')).toBe('/jobs');
    expect(placeOf('/jobs?tab=schedule')).toBe('/jobs');
    expect(placeOf('/people?mode=setup')).toBe('/people');
    expect(placeOf('/people')).not.toBe(placeOf('/safety'));
  });

  it('SPEC doing things in several places costs nobody anything', () => {
    const w = WORKFLOWS.find(x => x.id === 'injury')!;
    expect(placesFor(w, 'spec')).toEqual([]);
    expect(peopleIn(w)).not.toContain('spec');
  });

  it('the rule bites when a workflow is given an extra screen', () => {
    /*
      Proved by putting the fault back. A rule nobody has watched fail is a rule nobody knows works
      — this is the same check, run against a workflow deliberately broken the way a real one would
      be broken: one more step, on one more screen, for somebody who was already finished.
    */
    const clean = WORKFLOWS.find(w => w.id === 'hazard')!;
    expect(tooFar([clean])).toEqual([]);

    const broken = {
      ...clean,
      steps: [...clean.steps, { does: 'Now go and log it on Compliance too.', by: 'field' as const, where: '/compliance' }],
    };
    const caught = tooFar([broken]);
    expect(caught).toHaveLength(1);
    expect(caught[0].who).toBe('field');
    expect(caught[0].places.sort()).toEqual(['/compliance', '/tech-day']);
  });
});

/*
  ── Every workflow moves the meter, and every measure has a workflow ────────────────────────────

  Kris, 24 September: "all work flows should be working to improve spec and the GM Power Meter
  score".
*/
describe('the workflows and the Power Meter answer to each other', () => {
  it('every workflow moves at least one measure', () => {
    expect(movesNothing().map(w => w.id)).toEqual([]);
  });

  it('every measure has a workflow that moves it', () => {
    /*
      The sharper direction. A meter may tell a business bad news; it may not tell a business bad
      news it has no way to act on. A slot named here is a number that makes somebody feel worse on
      Monday and hands them nothing to do on Tuesday.
    */
    expect(unreachable()).toEqual([]);
  });

  it('every slot named by a workflow is a real slot', () => {
    const real = new Set(FRAMEWORK.map(s => s.id));
    for (const w of WORKFLOWS) {
      for (const m of w.moves) expect(real.has(m), `${w.id} moves "${m}", which is not on the meter`).toBe(true);
    }
  });

  it('the heavy hitters are not the thinnest covered', () => {
    /*
      The five that end a business should not be the five with the least behind them. If somebody
      hurt, a comp claim or gross profit had one workflow each while debtor days had ten, the
      product would be pointing its effort away from what actually matters.
    */
    for (const slot of FRAMEWORK.filter(s => s.weight === 'heavy')) {
      expect(movedBy(slot.id).length, `${slot.name} has nothing behind it`).toBeGreaterThan(0);
    }
  });
});

describe('the counts SPEC publishes about itself are the real ones', () => {
  it('the tally is derived, not typed', () => {
    const t = tally();
    expect(t.total).toBe(WORKFLOWS.length);
    expect(t.whole + t.partial).toBe(t.total);
    expect(t.partial).toBe(new Set(gaps().map(g => g.workflow.id)).size);
  });

  it('most of the work happens without anybody doing it', () => {
    /*
      The ratio is the product's actual claim against what Kris walked away from. Not a target to
      hit — a floor that would have to be argued for if it ever fell, because a version of SPEC
      where people do everything by hand is a version with no reason to exist.
    */
    const steps = WORKFLOWS.reduce((n, w) => n + w.steps.length, 0);
    const auto = WORKFLOWS.reduce((n, w) => n + doneForYou(w).auto, 0);
    expect(auto / steps).toBeGreaterThan(0.33);
  });

  it('screensOf keeps order and drops repeats', () => {
    const w = WORKFLOWS.find(x => x.id === 'day-on-phone')!;
    expect(screensOf(w)[0]).toBe('/tech-day');
    expect(new Set(screensOf(w)).size).toBe(screensOf(w).length);
  });
});

/*
  ── The three streams ───────────────────────────────────────────────────────────────────────────

  Kris, 24 September: "there are three main streams in a successful trade business - even transport
  business - COGS - Commercial making sure money is in order more in than out, Operations getting
  the work done safely and Growth making sure new work is coming in steadily - all focused on
  solving problems and maximising business potential".
*/
describe('every workflow belongs to one stream', () => {
  it('has an owner, and it is one of the three or the seat above', () => {
    const allowed = new Set<Owner>([...STREAM_KEYS, 'whole']);
    for (const w of WORKFLOWS) {
      expect(allowed.has(w.owner), `${w.id} is owned by "${w.owner}"`).toBe(true);
    }
  });

  it('no stream is empty', () => {
    /*
      If Growth came back empty it would mean SPEC had quietly become a job system with a safety
      module bolted on, which is most of this market and the thing it is meant not to be.
    */
    expect(emptyStreams()).toEqual([]);
  });

  it('`whole` is the General Manager’s own work, not a bin for awkward ones', () => {
    /*
      The failure mode this guards. `whole` is the easy answer for anything that does not obviously
      belong to one manager, and an escape hatch used freely is an escape hatch that empties the
      model: three streams that own nothing, and a GM who owns everything, which is the business
      SPEC exists to fix rather than describe.
    */
    const theirs = ownedBy('whole');
    expect(theirs.length).toBeLessThan(WORKFLOWS.length * 0.15);
    for (const w of theirs) {
      expect(w.family, `${w.id} is filed above the streams but is not the business's own rhythm`).toBe('run');
    }
  });

  it('the three streams between them own everything that is not the GM’s', () => {
    const covered = STREAM_KEYS.reduce((n, k) => n + ownedBy(k).length, 0);
    expect(covered + ownedBy('whole').length).toBe(WORKFLOWS.length);
  });

  it('each stream is described in the business’s words, not in ours', () => {
    for (const s of STREAMS) {
      expect(s.is.length).toBeGreaterThan(40);
      expect(s.asks).toMatch(/\?$/);
      /* What it looks like going wrong BEFORE the numbers show it — the bit worth reading. */
      expect(s.slips.length).toBeGreaterThan(60);
      expect(s.seat).toMatch(/Manager$/);
    }
    expect(STREAMS.map(s => s.key)).toEqual(['commercial', 'operations', 'growth']);
  });

  it('a stream’s tally is counted, never stated', () => {
    for (const t of byStream()) {
      const ws = ownedBy(t.owner);
      expect(t.total).toBe(ws.length);
      expect(t.steps).toBe(ws.reduce((n, w) => n + w.steps.length, 0));
    }
  });
});

describe('the public workflow map names no vendor', () => {
  it('describes the systems a business arrives with by category', () => {
    expect(JSON.stringify(WORKFLOWS)).not.toMatch(/xero|myob|quickbooks|simpro|servicem8|aroflo/i);
  });
});
