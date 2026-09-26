import { describe, it, expect } from 'vitest';
import { cleanReading, readFromWords, questionsMessage, checkLine } from '../src/lib/understand';

const kits = [
  { id: 'k-ev', name: 'EV charger install' },
  { id: 'k-sb', name: 'Switchboard upgrade' },
];

describe('understand the work', () => {
  it('keeps only this business\'s own kits — a kit the model made up never reaches a quote', () => {
    const r = cleanReading({ scope: [{ kitId: 'k-ev', qty: 1 }, { kitId: 'invented', qty: 2 }, { kitId: 'k-ev', qty: 3 }] }, kits);
    expect(r.scope).toEqual([{ kitId: 'k-ev', qty: 1 }]);
  });

  it('bounds extra hours and drops the empty ones', () => {
    const r = cleanReading({ extras: [{ label: 'Asbestos precautions', hours: 1.5 }, { label: 'Huge', hours: 999 }, { label: '', hours: 2 }, { label: 'None', hours: -1 }] }, kits);
    expect(r.extras).toEqual([{ label: 'Asbestos precautions', hours: 1.5 }, { label: 'Huge', hours: 40 }]);
  });

  it('survives an answer that is not the right shape at all', () => {
    expect(cleanReading('nonsense', kits)).toEqual({ sees: [], scope: [], extras: [], questions: [] });
    expect(cleanReading({ sees: [{ text: 'Old board', flag: 'weird' }] }, kits).sees[0]).toEqual({ from: 'Photo', text: 'Old board', flag: 'ok' });
  });

  it('without the model, matches the customer\'s words to the pre-builds and says it did not look at the photos', () => {
    const r = readFromWords('We want an EV charger in the garage', kits, 3);
    expect(r.scope).toEqual([{ kitId: 'k-ev', qty: 1 }]);
    expect(r.sees.some(s => s.flag === 'check' && /photos/i.test(s.text))).toBe(true);
  });

  it('asks what they want when nothing matches, rather than guessing a job', () => {
    const r = readFromWords('hello', kits, 0);
    expect(r.scope).toEqual([]);
    expect(r.questions.length).toBe(1);
  });

  it('drafts the questions to the customer by first name', () => {
    expect(checkLine('Sam Lee', 2)).toBe('Two things to check with Sam first');
    const m = questionsMessage('Sam Lee', ['Is it the garage wall?', 'Can we test the backing board?'], 'Acme Electrical');
    expect(m.startsWith('Hi Sam,')).toBe(true);
    expect(m).toContain('Two quick questions');
    expect(m.endsWith('Acme Electrical')).toBe(true);
    expect(questionsMessage('Sam', [], 'Acme')).toBe('');
  });
});

import { cleanTakeoff, takeoffLine } from '../src/lib/understand';

describe('estimate from plans', () => {
  it('keeps only real kits and whole, sane counts, and carries what SPEC was unsure of', () => {
    const rows = cleanTakeoff({ rows: [
      { kitId: 'k-ev', where: 'Garage', qty: 2.4, unsure: false },
      { kitId: 'k-sb', where: 'Hall', qty: 1, unsure: true },
      { kitId: 'made-up', qty: 5 },
      { kitId: 'k-ev', qty: 0 },
    ] }, kits);
    expect(rows).toEqual([
      { kitId: 'k-ev', where: 'Garage', qty: 2, unsure: false },
      { kitId: 'k-sb', where: 'Hall', qty: 1, unsure: true },
    ]);
    expect(takeoffLine(rows)).toBe('2 lines counted · 1 marked for you to confirm');
  });
});

describe('estimate from plans, read back', () => {
  it('reads the stored list the same as the model\'s answer — the counts are never dropped on the way back', () => {
    const stored = JSON.parse(JSON.stringify([{ kitId: 'k-ev', where: 'Unit 1', qty: 2, unsure: false }]));
    expect(cleanTakeoff(stored, kits)).toEqual([{ kitId: 'k-ev', where: 'Unit 1', qty: 2, unsure: false }]);
  });
});
