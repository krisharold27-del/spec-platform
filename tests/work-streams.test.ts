import { describe, it, expect } from 'vitest';
import {
  WORK_KINDS, WORK_KEYS, isWorkKind, isProjectLike, EXAMPLE_STREAMS,
  mixOf, concentration, TOO_CONCENTRATED, feeding, THIN_COVER, STARVING_COVER,
  steadiness, shutdownWatch, SHUTDOWN_LOCK_DAYS,
} from '../src/lib/work-streams';

const at = (iso: string) => new Date(`${iso}T09:00:00.000Z`);
/* JBI's own four, used as the worked example throughout — Kris, 24 September. */
const JBI = ['Industrial', 'Commercial', 'Renewables', 'Mining']
  .map(name => ({ id: name.toLowerCase(), name, active: true }));

const job = (streamId: string | null, kind: 'maintenance' | 'project' | 'shutdown' | null, valueCents: number, won = true) =>
  ({ streamId, kind, valueCents, won, at: '2026-06-01T00:00:00.000Z' });

describe('the kinds of work are fixed, and the streams are the business’s own', () => {
  it('is maintenance, project and shutdown — not a business’s to change', () => {
    /*
      Unlike the streams, this is not a description of a market. It is a description of how work
      BEHAVES, and it behaves the same way in every trade business there is.
    */
    expect(WORK_KEYS).toEqual(['maintenance', 'project', 'shutdown']);
    expect(isWorkKind('maintenance')).toBe(true);
    expect(isWorkKind('renewables')).toBe(false);
  });

  it('only maintenance is steady, and a shutdown is a project that cannot slip', () => {
    expect(WORK_KINDS.find(k => k.key === 'maintenance')!.steady).toBe(true);
    expect(WORK_KINDS.filter(k => k.steady).map(k => k.key)).toEqual(['maintenance']);
    expect(isProjectLike('project')).toBe(true);
    expect(isProjectLike('shutdown')).toBe(true);
    expect(isProjectLike('maintenance')).toBe(false);
  });

  it('every kind says what to watch for, which is the part worth reading', () => {
    for (const k of WORK_KINDS) {
      expect(k.is.length).toBeGreaterThan(40);
      expect(k.watch.length).toBeGreaterThan(50);
    }
  });

  it('JBI’s four are an example, never a default', () => {
    /*
      A business shown four streams it did not choose will keep them, and then SPEC has quietly
      decided what markets somebody works in.
    */
    expect([...EXAMPLE_STREAMS]).toEqual(['Industrial', 'Commercial', 'Renewables', 'Mining']);
    expect(mixOf([], [job('mining', 'project', 100)])).toEqual([]);
  });
});

describe('where the work actually is', () => {
  it('divides won work across the streams, biggest first', () => {
    const mix = mixOf(JBI, [
      job('mining', 'shutdown', 600_000), job('industrial', 'maintenance', 300_000),
      job('commercial', 'project', 100_000),
    ]);
    expect(mix[0].name).toBe('Mining');
    expect(mix[0].share).toBeCloseTo(0.6, 5);
    expect(mix.find(m => m.name === 'Renewables')!.wonCents).toBe(0);
  });

  it('shares are of won work, never of the pipeline', () => {
    /* A stream with an enormous quote out has not won anything, and must not read as if it has. */
    const mix = mixOf(JBI, [
      job('mining', 'project', 100_000),
      job('renewables', 'project', 9_000_000, false),
    ]);
    expect(mix.find(m => m.name === 'Mining')!.share).toBe(1);
    expect(mix.find(m => m.name === 'Renewables')!.share).toBe(0);
    expect(mix.find(m => m.name === 'Renewables')!.quotingCents).toBe(9_000_000);
  });
});

describe('four names on the letterhead, one paying for everything', () => {
  it('calls it exposed past half', () => {
    expect(TOO_CONCENTRATED).toBe(0.5);
    const c = concentration(mixOf(JBI, [
      job('mining', 'shutdown', 700_000), job('industrial', 'maintenance', 200_000),
      job('commercial', 'project', 100_000),
    ]));
    expect(c.exposed).toBe(true);
    expect(c.top!.name).toBe('Mining');
    expect(c.says).toMatch(/70%/);
    expect(c.says).toMatch(/letterhead/);
  });

  it('is happy with a real spread', () => {
    const c = concentration(mixOf(JBI, [
      job('mining', 'project', 300_000), job('industrial', 'maintenance', 300_000),
      job('commercial', 'project', 250_000), job('renewables', 'project', 250_000),
    ]));
    expect(c.exposed).toBe(false);
    expect(c.says).toMatch(/spread across 4 streams/);
  });

  it('says a one-stream business is exposed without calling it a mistake', () => {
    const c = concentration(mixOf(JBI, [job('industrial', 'maintenance', 500_000)]));
    expect(c.exposed).toBe(true);
    expect(c.says).toMatch(/not a criticism/);
  });

  it('says nothing when nothing is tagged', () => {
    expect(concentration(mixOf(JBI, [])).top).toBeNull();
  });
});

describe('is each stream still being fed?', () => {
  it('names the stream that is starving while the total looks fine', () => {
    /*
      The whole point. Turnover holds, the board is busy, everything looks fine — and mining has not
      quoted anything in two months. By the time it shows in the total it is a six-month hole.
    */
    const f = feeding(JBI,
      { industrial: 400_000, commercial: 400_000, renewables: 400_000, mining: 400_000 },
      { industrial: 500_000, commercial: 600_000, renewables: 700_000, mining: 40_000 },
    );
    const mining = f.find(x => x.name === 'Mining')!;
    expect(mining.state).toBe('starving');
    expect(mining.says).toMatch(/runs out/);
    expect(f.filter(x => x.state === 'fed')).toHaveLength(3);
  });

  it('catches the slow shrink nobody notices', () => {
    const f = feeding(JBI, { mining: 100_000 }, { mining: 80_000 });
    const mining = f.find(x => x.name === 'Mining')!;
    expect(mining.state).toBe('thin');
    expect(mining.cover).toBeLessThan(THIN_COVER);
    expect(mining.cover).toBeGreaterThan(STARVING_COVER);
    expect(mining.says).toMatch(/nobody notices/);
  });

  it('a stream with nothing at all is quiet, not starving', () => {
    /* Winding a stream down deliberately is a decision, not a fault, and must not read as a fault. */
    expect(feeding(JBI, {}, {}).every(x => x.state === 'quiet')).toBe(true);
  });

  it('nothing finishing and work being quoted is growing', () => {
    const f = feeding(JBI, { renewables: 0 }, { renewables: 250_000 });
    expect(f.find(x => x.name === 'Renewables')!.state).toBe('fed');
    expect(f.find(x => x.name === 'Renewables')!.says).toMatch(/growing/);
  });
});

describe('how much of the year is there before anybody sells anything', () => {
  it('counts maintenance against project and shutdown together', () => {
    const s = steadiness([
      job('industrial', 'maintenance', 400_000),
      job('mining', 'shutdown', 400_000),
      job('commercial', 'project', 200_000),
    ]);
    expect(s.maintenanceCents).toBe(400_000);
    expect(s.projectCents).toBe(600_000);
    expect(s.steadyShare).toBeCloseTo(0.4, 5);
  });

  it('says plainly when every January starts at nothing', () => {
    const s = steadiness([job('mining', 'project', 900_000)]);
    expect(s.steadyShare).toBe(0);
    expect(s.says).toMatch(/starts at nothing/);
  });

  it('sets no target, because the right share depends on the market', () => {
    /* A number SPEC invented is a number somebody optimises against for no reason. */
    const src = require('node:fs').readFileSync('src/lib/work-streams.ts', 'utf8');
    const block = src.slice(src.indexOf('export function steadiness'));
    expect(block).not.toMatch(/GOOD_|TARGET|SHOULD_BE/);
  });

  it('ignores work that is only being quoted', () => {
    const s = steadiness([job('mining', 'maintenance', 900_000, false)]);
    expect(s.maintenanceCents).toBe(0);
  });
});

describe('a shutdown window does not move', () => {
  const sd = (over = {}) => ({
    id: 's1', title: 'Mill shutdown', streamId: 'mining',
    startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-14T00:00:00.000Z',
    crewNeeded: 12, crewConfirmed: 12, materialsOrdered: true, ...over,
  });

  it('is ready when crew and materials are both settled', () => {
    const w = shutdownWatch(sd(), at('2026-08-01'));
    expect(w.ready).toBe(true);
    expect(w.missing).toEqual([]);
  });

  it('names exactly what is missing', () => {
    const w = shutdownWatch(sd({ crewConfirmed: 8, materialsOrdered: false }), at('2026-06-01'));
    expect(w.missing).toEqual(['4 of 12 crew not confirmed', 'materials not all ordered']);
  });

  it('inside six weeks it says this can no longer be caught up', () => {
    /*
      The plant starts again on its date whether the work is finished or not, and what is left
      undone waits for the next shutdown a year away.
    */
    expect(SHUTDOWN_LOCK_DAYS).toBe(42);
    const w = shutdownWatch(sd({ materialsOrdered: false }), at('2026-08-10'));
    expect(w.daysOut).toBeLessThanOrEqual(SHUTDOWN_LOCK_DAYS);
    expect(w.says).toMatch(/opens on its date/);
  });

  it('further out it lists what is still to settle, without alarm', () => {
    const w = shutdownWatch(sd({ materialsOrdered: false }), at('2026-06-01'));
    expect(w.says).toMatch(/Still to settle/);
    expect(w.says).not.toMatch(/opens on its date/);
  });
});
