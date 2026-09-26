import { describe, expect, it, vi } from 'vitest';
import { nameQuery, withDeadline } from '../src/lib/db-deadline';

/**
 * A query that answers after `ms`, or never when ms is null, and can be dropped like a socket.
 * A Promise subclass, as a postgres.js query is — so `await` goes through its `then`, and the
 * answer only starts coming once somebody asks for it, as a real query's does.
 */
class FakeQuery extends Promise<unknown> {}
function fakeQuery(ms: number | null) {
  let drop: (e: Error) => void = () => {};
  const query = new FakeQuery((resolve, reject) => {
    drop = reject;
    if (ms !== null) setTimeout(() => resolve([{ ok: 1 }]), ms);
  });
  return { query, drop: () => drop(new Error('CONNECTION_DESTROYED')) };
}

describe('a deadline on every database wait', () => {
  it('lets a quick answer through untouched and logs nothing', async () => {
    const log = vi.fn();
    const onStuck = vi.fn();
    const { query } = fakeQuery(5);
    await expect(withDeadline(query, 'select 1', { deadlineMs: 200, slowMs: 100, onStuck, log })).resolves.toEqual([{ ok: 1 }]);
    expect(onStuck).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('turns an answer that never comes into an error, and names the query', async () => {
    const log = vi.fn();
    const f = fakeQuery(null);
    const onStuck = vi.fn(() => f.drop());
    await expect(withDeadline(f.query, 'select *\n  from roles where tenant_id = $1', { deadlineMs: 30, slowMs: 10, onStuck, log }))
      .rejects.toThrow('CONNECTION_DESTROYED');
    expect(onStuck).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toBe('[db] no answer after 30ms, reconnecting: select * from roles where tenant_id = $1');
  });

  it('logs a slow answer that still made it', async () => {
    const log = vi.fn();
    const { query } = fakeQuery(40);
    await withDeadline(query, 'select 2', { deadlineMs: 500, slowMs: 20, onStuck: vi.fn(), log });
    expect(log.mock.calls[0][0]).toMatch(/^\[db\] slow query \d+ms: select 2$/);
  });

  it('never logs parameters, only the query text, clipped', () => {
    expect(nameQuery('x'.repeat(300))).toHaveLength(140);
  });
});
