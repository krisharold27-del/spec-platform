import { describe, it, expect } from 'vitest';
import { expectedShape, compareShape, driftLine } from '../src/lib/schema-check';

/**
 * The schema check is the thing that catches a deploy where the code shipped and the database did
 * not. It is only worth having if it actually fails when it should, so most of this file is about
 * making it fail.
 */

const shape = (o: Record<string, string[]>) =>
  new Map(Object.entries(o).map(([t, c]) => [t, new Set(c)]));

describe('expectedShape', () => {
  // Derived from the Drizzle definitions, never hand-written: a second list of columns would drift
  // the first time somebody adds one, and a drifted check reports healthy, which is worse than none.
  it('reads the real tables out of the schema module', () => {
    const s = expectedShape();
    expect(s.size).toBeGreaterThan(15);
    expect([...s.keys()]).toContain('criteria');
    expect([...s.keys()]).toContain('assessment_periods');
  });

  it('carries the columns this release actually added', () => {
    const s = expectedShape();
    expect(s.get('criteria')).toContain('proposed_target');
    expect([...s.keys()]).toEqual(expect.arrayContaining(['training_modules', 'role_curriculum', 'training_records']));
  });

  it('skips whatever in the module is not a table', () => {
    for (const [name, cols] of expectedShape()) {
      expect(typeof name).toBe('string');
      expect(cols.size).toBeGreaterThan(0);
    }
  });
});

describe('compareShape', () => {
  it('is quiet when the database has everything', () => {
    const want = shape({ criteria: ['id', 'target'] });
    expect(compareShape(want, shape({ criteria: ['id', 'target'] }))).toEqual({
      missingTables: [], missingColumns: [],
    });
  });

  it('names a table the database has never been given', () => {
    const d = compareShape(shape({ training_records: ['id'] }), shape({}));
    expect(d.missingTables).toEqual(['training_records']);
  });

  /** The exact failure this release could have caused: code shipped, column not pushed. */
  it('names a column the database is missing, and says which table', () => {
    const d = compareShape(
      shape({ criteria: ['id', 'target', 'proposed_target'] }),
      shape({ criteria: ['id', 'target'] }),
    );
    expect(d.missingTables).toEqual([]);
    expect(d.missingColumns).toEqual([{ table: 'criteria', columns: ['proposed_target'] }]);
  });

  /**
   * One-directional on purpose. A column the database has and the code does not is what every
   * rollback and every mid-migration state looks like; flagging it would cry wolf on exactly the
   * deploys somebody is already watching closely.
   */
  it('does not complain about a column the code no longer uses', () => {
    const d = compareShape(shape({ criteria: ['id'] }), shape({ criteria: ['id', 'legacy_flag'] }));
    expect(d).toEqual({ missingTables: [], missingColumns: [] });
  });

  it('reports every missing thing rather than stopping at the first', () => {
    const d = compareShape(
      shape({ a: ['x'], b: ['y', 'z'], c: ['w'] }),
      shape({ b: ['y'], c: ['w'] }),
    );
    expect(d.missingTables).toEqual(['a']);
    expect(d.missingColumns).toEqual([{ table: 'b', columns: ['z'] }]);
  });
});

describe('driftLine', () => {
  it('says plainly when there is nothing to do', () => {
    expect(driftLine({ missingTables: [], missingColumns: [] })).toContain('has everything this build expects');
  });

  // An operator reading this is deciding whether to act right now, so it has to name the action.
  it('counts both kinds and names the fix', () => {
    const line = driftLine({
      missingTables: ['training_records'],
      missingColumns: [{ table: 'criteria', columns: ['proposed_target', 'direction'] }],
    });
    expect(line).toContain('1 table');
    expect(line).toContain('2 columns');
    expect(line).toContain('schema push');
  });

  it('uses singulars where there is one of something', () => {
    expect(driftLine({ missingTables: [], missingColumns: [{ table: 'criteria', columns: ['x'] }] }))
      .toContain('1 column');
  });
});
