import { describe, it, expect } from 'vitest';
import { toneOf, labelOf, isExcluded, summarise, provenance, preparedBy, unexplained } from '../src/lib/scorecard';
import type { ScorecardRow } from '../src/lib/queries';
import type { Pillar } from '../src/lib/scoring';

const row = (over: Partial<ScorecardRow> & { pillar: Pillar; text: string }): ScorecardRow => ({
  criterionId: over.text.replace(/\W+/g, '-').toLowerCase(),
  weight: 0.5, kpi: true, target: null, answer: '', note: null, status: null, result: null, source: null,
  ...over,
});

describe('toneOf', () => {
  it('is green for anything that counted as met', () => {
    for (const status of ['confirmed', 'met', 'on_track']) {
      expect(toneOf(row({ pillar: 'safety', text: 'x', status, answer: 'Y' }))).toBe('green');
    }
  });

  it('is red only for a genuine miss', () => {
    expect(toneOf(row({ pillar: 'safety', text: 'x', status: 'not_met', answer: 'N' }))).toBe('red');
  });

  // Not-measured-yet is not doing-badly. Watch is the one neutral state worth seeing.
  it('is grey for absences and amber for watch, never red', () => {
    expect(toneOf(row({ pillar: 'safety', text: 'x', status: 'pending', answer: 'NA' }))).toBe('grey');
    expect(toneOf(row({ pillar: 'safety', text: 'x', status: 'not_tracked', answer: 'NA' }))).toBe('grey');
    expect(toneOf(row({ pillar: 'safety', text: 'x' }))).toBe('grey');
    expect(toneOf(row({ pillar: 'safety', text: 'x', status: 'watch', answer: 'NA' }))).toBe('amber');
  });

  it('labels an unmarked row Pending rather than leaving it blank', () => {
    expect(labelOf(row({ pillar: 'safety', text: 'x' }))).toBe('Pending');
    expect(labelOf(row({ pillar: 'safety', text: 'x', status: 'not_tracked' }))).toBe('Not tracked');
  });
});

describe('isExcluded', () => {
  it('excludes everything that is not a Y or an N', () => {
    expect(isExcluded(row({ pillar: 'safety', text: 'x', answer: 'Y' }))).toBe(false);
    expect(isExcluded(row({ pillar: 'safety', text: 'x', answer: 'N' }))).toBe(false);
    expect(isExcluded(row({ pillar: 'safety', text: 'x', answer: 'NA' }))).toBe(true);
    expect(isExcluded(row({ pillar: 'safety', text: 'x' }))).toBe(true);
  });
});

describe('summarise', () => {
  it('says plainly when a pillar has nothing against it', () => {
    expect(summarise([], 'safety', null).line).toBe('Nothing set against this pillar yet.');
  });

  // A pillar with no score is not the same as a bad one, and the line has to say so.
  it('distinguishes an unmarked pillar from a poor one', () => {
    const rows = [row({ pillar: 'safety', text: 'a' }), row({ pillar: 'safety', text: 'b' })];
    const s = summarise(rows, 'safety', null);
    expect(s.line).toContain('none marked');
    expect(s.line).toContain('not the same as a bad one');
    expect(s.tone).toBe('grey');
  });

  it('counts confirmed against decided, and names what sits outside', () => {
    const rows = [
      row({ pillar: 'safety', text: 'Zero incidents', answer: 'Y', status: 'confirmed' }),
      row({ pillar: 'safety', text: 'Claims', answer: 'Y', status: 'confirmed' }),
      row({ pillar: 'safety', text: 'LTI count', answer: 'N', status: 'not_met' }),
      row({ pillar: 'safety', text: 'TRIFR', answer: 'NA', status: 'not_tracked' }),
      row({ pillar: 'safety', text: 'Days without harm' }),
    ];
    const s = summarise(rows, 'safety', 2 / 3);
    expect(s.line).toBe('2 of 3 confirmed · 1 not tracked · 1 still to mark.');
    expect(s.total).toBe(5);
    expect(s.excluded).toBe(2);
    expect(s.notTracked).toBe(1);
    expect(s.tone).toBe('red');
  });

  it('tones on the 90 and 75 thresholds', () => {
    const mk = (score: number) => summarise([row({ pillar: 'people', text: 'x', answer: 'Y' })], 'people', score).tone;
    expect(mk(1)).toBe('green');
    expect(mk(0.9)).toBe('green');
    expect(mk(0.89)).toBe('amber');
    expect(mk(0.74)).toBe('red');
  });

  it('reads only its own pillar', () => {
    const rows = [
      row({ pillar: 'safety', text: 'a', answer: 'Y' }),
      row({ pillar: 'people', text: 'b', answer: 'N' }),
    ];
    expect(summarise(rows, 'people', 0).total).toBe(1);
  });
});

describe('provenance', () => {
  it('groups the measures behind each source, in a stable order', () => {
    const p = provenance([
      row({ pillar: 'earnings', text: 'Margin', source: 'Accounts package' }),
      row({ pillar: 'safety', text: 'Incidents', source: 'Manual — GM confirmation' }),
      row({ pillar: 'earnings', text: 'Revenue', source: 'Accounts package' }),
    ]);
    expect(p.map(l => l.source)).toEqual(['Accounts package', 'Manual — GM confirmation']);
    expect(p[0].measures).toEqual(['Margin', 'Revenue']);
  });

  // An unsourced number beside sourced ones is the most misleading thing a report can do.
  it('collects unsourced measures under their own honest heading, last', () => {
    const p = provenance([
      row({ pillar: 'safety', text: 'Incidents', source: 'Manual — GM confirmation' }),
      row({ pillar: 'safety', text: 'TRIFR' }),
      row({ pillar: 'safety', text: 'Near misses', source: '   ' }),
    ]);
    expect(p[p.length - 1]).toEqual({
      source: 'Nothing produces this yet',
      measures: ['TRIFR', 'Near misses'],
      unbacked: true,
    });
  });

  it('is empty for an empty card', () => {
    expect(provenance([])).toEqual([]);
  });
});

describe('preparedBy', () => {
  it('says a vacant role keeps its card for whoever comes next', () => {
    expect(preparedBy(null, 0)).toContain('whoever comes next');
  });

  // A card nobody has put their name to is a draft, and saying so beats letting it pass as a result.
  it('flags a card with nothing marked on it', () => {
    expect(preparedBy('J. Barnes', 0)).toBe('J. Barnes — nothing marked yet');
    expect(preparedBy('J. Barnes', 3)).toBe('J. Barnes');
  });
});

describe('unexplained', () => {
  it('finds misses with no note, and ignores the ones that have one', () => {
    const rows = [
      row({ pillar: 'earnings', text: 'Margin', answer: 'N' }),
      row({ pillar: 'earnings', text: 'Revenue', answer: 'N', note: 'Two jobs slipped.' }),
      row({ pillar: 'safety', text: 'Incidents', answer: 'Y' }),
    ];
    expect(unexplained(rows).map(r => r.text)).toEqual(['Margin']);
  });
});
