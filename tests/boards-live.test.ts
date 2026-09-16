import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOARD_TYPES, EDITING_WINDOW_MS, agoWords, boardMeta, cardLabel, feedLabel, initials,
  kindOf, liveAgainst, readHeadline, readList, stepStateOf, stillHere, visible,
} from '../src/lib/boards-live';

/**
 * Boards — the live artifacts a team pins, builds on and argues about.
 *
 * Kris, 16 September: *"no build these boards (artifacts) now - this is a key component of running
 * the business properly"*.
 *
 * Most of what is worth holding here is about honesty on a screen where somebody is about to make a
 * decision about money.
 */

describe('what kind of board it is', () => {
  it('knows the six the design draws, in that order', () => {
    expect(BOARD_TYPES.map(t => t.id)).toEqual(['live', 'plans', 'kpi', 'improve', 'training', 'meetings']);
  });

  it('labels a card with the singular, because a card is one of them', () => {
    expect(cardLabel('plans')).toBe('Plan');
    expect(cardLabel('meetings')).toBe('Meeting output');
    expect(cardLabel('improve')).toBe('Improvement opportunity');
  });

  it('falls back rather than throwing on something it does not recognise', () => {
    expect(kindOf('nonsense')).toBe('improve');
    expect(kindOf(null)).toBe('improve');
  });

  it('filters, and All means all', () => {
    const all = [{ kind: 'live' as const }, { kind: 'plans' as const }, { kind: 'live' as const }];
    expect(visible(all, null)).toHaveLength(3);
    expect(visible(all, 'live')).toHaveLength(2);
    expect(visible(all, 'meetings')).toHaveLength(0);
  });
});

describe('whether a board is really live', () => {
  const feeds = [{ system: 'Simpro', what: 'job cost feed' }, { system: 'Xero', what: 'actuals feed' }];

  it('is live only when every system it names is connected AND working', () => {
    const { live, missing } = liveAgainst(feeds, [
      { name: 'Simpro', status: 'live' }, { name: 'Xero', status: 'live' },
    ]);
    expect(live).toBe(true);
    expect(missing).toEqual([]);
  });

  /*
    The one that matters. A board with one working feed out of two is PARTLY current, which on a
    screen reads as current — and this is the screen where somebody decides to drop a sell rate by
    ten dollars an hour. So it is not live, and the page names the feed that is the reason.
  */
  it('IS NOT LIVE WHEN ONE FEED HAS BROKEN, and says which', () => {
    const { live, missing } = liveAgainst(feeds, [
      { name: 'Simpro', status: 'live' }, { name: 'Xero', status: 'broken' },
    ]);
    expect(live).toBe(false);
    expect(missing).toEqual(['Xero']);
  });

  it('is not live for a system that was only ever requested', () => {
    expect(liveAgainst(feeds, [
      { name: 'Simpro', status: 'live' }, { name: 'Xero', status: 'requested' },
    ]).live).toBe(false);
  });

  it('matches a system however it was capitalised or spaced', () => {
    expect(liveAgainst([{ system: 'Xero', what: 'actuals feed' }], [{ name: '  xero ', status: 'live' }]).live).toBe(true);
  });

  it('a board with no feeds is never live — there is nothing for it to be live against', () => {
    expect(liveAgainst([], [{ name: 'Simpro', status: 'live' }]).live).toBe(false);
  });

  it('writes a feed the way the design writes it', () => {
    expect(feedLabel({ system: 'Xero', what: 'actuals feed' })).toBe('Xero — actuals feed');
  });
});

describe('who is in the room', () => {
  it('counts somebody who was here a minute ago, and not somebody from an hour ago', () => {
    const now = Date.now();
    expect(stillHere(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(stillHere(new Date(now - 60 * 60_000).toISOString(), now)).toBe(false);
  });

  it('forgets them after five minutes', () => {
    const now = Date.now();
    expect(EDITING_WINDOW_MS).toBe(5 * 60_000);
    expect(stillHere(new Date(now - EDITING_WINDOW_MS + 1_000).toISOString(), now)).toBe(true);
    expect(stillHere(new Date(now - EDITING_WINDOW_MS - 1_000).toISOString(), now)).toBe(false);
  });

  it('makes two letters out of a name, and never more', () => {
    expect(initials('Kris Harold')).toBe('KH');
    expect(initials('Anthony')).toBe('AN');
    expect(initials('  jordan  dean ')).toBe('JD');
    expect(initials('')).toBe('??');
  });
});

describe('the line under every card', () => {
  it('counts editors, and says when it last moved', () => {
    const today = new Date('2026-09-16T09:00:00Z');
    expect(boardMeta(3, '2026-09-16T08:00:00Z', today)).toBe('3 editors · updated today');
    expect(boardMeta(1, '2026-09-15T08:00:00Z', today)).toBe('1 editor · updated yesterday');
  });

  it('says elapsed time, never a bare date', () => {
    const now = new Date('2026-09-16T09:00:00Z');
    expect(agoWords('2026-09-12T09:00:00Z', now)).toBe('4d ago');
    expect(agoWords('2026-09-02T09:00:00Z', now)).toBe('2w ago');
    expect(agoWords('not a date', now)).toBe('recently');
  });
});

describe('a board body that is stored as text', () => {
  it('reads what is there', () => {
    expect(readList<{ a: number }>('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(readHeadline('{"now":"$105/hr"}')?.now).toBe('$105/hr');
  });

  /*
    A malformed row must never take a page down. The board is the thing a team is standing around
    arguing over; an exception there is the worst possible moment for one.
  */
  it('NEVER THROWS on something malformed, whatever is in the column', () => {
    expect(readList('not json')).toEqual([]);
    expect(readList('{"not":"a list"}')).toEqual([]);
    expect(readList(null)).toEqual([]);
    expect(readHeadline('not json')).toBe(null);
    expect(readHeadline('{"no":"now key"}')).toBe(null);
  });

  it('keeps a step honest about where it has got to, and never scores it', () => {
    expect(stepStateOf('blocked')).toBe('blocked');
    expect(stepStateOf('anything else')).toBe('todo');
  });
});

/** Held against the code, because each of these is a way the screen could start lying. */
describe('the promises the page makes', () => {
  const reads = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

  it('works out live from the connections rather than trusting the stored flag', () => {
    const src = reads('src/lib/boards-live-data.ts');
    expect(src).toContain('liveAgainst');
    expect(src, 'the row’s own live column is only ever a hint').not.toMatch(/live:\s*r\.live/);
  });

  it('never shows faces that are not really there', () => {
    const page = reads('src/app/boards/page.tsx');
    expect(page).toContain('editingNow');
    expect(page).toContain('Just you, right now.');
  });

  it('a visitor looking around still writes nothing', () => {
    expect(reads('src/app/boards/actions.ts')).toContain('assertWritable');
  });

  it('the worked examples are only ever for a look-around', () => {
    // A real business's first board has to be their own, or the gallery fills with furniture
    // nobody put there and everybody is afraid to delete.
    const callers = reads('src/app/look/route.ts');
    expect(callers).toContain('addExampleBoards');
    expect(reads('src/app/signup/actions.ts')).not.toContain('addExampleBoards');
  });

  it('Conversation boards survived, and is still reachable', () => {
    expect(reads('src/lib/doors.ts')).toContain('/boards/conversations');
    expect(reads('src/app/boards/page.tsx')).toContain('/boards/conversations');
  });

  it('and the delete knows about all three new tables', () => {
    const del = reads('src/lib/delete-business.ts');
    for (const t of ['boards', 'board_comments', 'board_viewers']) expect(del).toContain(t);
  });
});
