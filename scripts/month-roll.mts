/**
 * The month rolling over, driven against a real database.
 *
 * ── Why this is not a unit test ──────────────────────────────────────────────────────────────────
 *
 * `tests/month-rhythm.test.ts` proves `needsNewMonth` answers correctly. That is the decision, and
 * the decision was never the thing that was broken — `currentPeriod` simply never asked it. It
 * returned the LAST period whenever none was open, so a business that signed September off would
 * have opened SPEC on 1 October and been shown September, signed and unmarkable, as its current
 * month, with no way to start the new one.
 *
 * Nothing that stops short of the database can catch that, because the fault is in which row comes
 * back. So this puts a signed, locked month from the past in front of `currentPeriod` and asks what
 * it hands over.
 *
 * Proved by putting the fault back: on the old code the first check reads FAIL.
 *
 *   node --import tsx scripts/month-roll.mts
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { currentPeriod, monthNow } from '../src/lib/period';

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const tenantId = randomUUID();
const tidy = async () => {
  await db.delete(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
};

try {
  await db.insert(schema.tenants).values({
    id: tenantId,
    name: `Month roll ${Date.now()}`,
    startDate: new Date().toISOString().slice(0, 10),
  });

  /*
    A month that is definitively finished: locked AND signed. This is the state a well-run business
    is in on the 1st, and it was exactly the state that used to trap them.
  */
  const past = '2000-01';
  await db.insert(schema.periods).values({
    id: randomUUID(), tenantId, period: past, status: 'locked',
    submittedBy: 'the-gm', submittedAt: '2000-01-31',
    signedBy: 'the-director', signedAt: '2000-02-01',
  });

  const got = await currentPeriod(tenantId);
  check('A NEW MONTH OPENS ONCE THE CALENDAR HAS MOVED PAST THE LAST ONE',
        got?.period === monthNow(),
        `it handed back ${got?.period} (${got?.status}) as the current month`);
  check('and the new month is open to be marked', got?.status === 'open');

  const all = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  const old = all.find(p => p.period === past);

  /*
    "Nothing is deleted." The finished month keeps its status and both signatures — it is still
    reviewed and signed off on its own timetable, and the board pack is read from it.
  */
  check('THE FINISHED MONTH IS LEFT EXACTLY AS IT WAS',
        old?.status === 'locked' && old?.signedBy === 'the-director' && old?.submittedBy === 'the-gm',
        JSON.stringify(old));
  check('and it is still there — a roll adds, it never replaces', all.length === 2,
        `${all.length} periods: ${all.map(p => p.period).join(', ')}`);

  /* Asking twice must not open two. The unique index is the guard; this proves it holds. */
  await currentPeriod(tenantId);
  const again = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  check('ASKING TWICE DOES NOT OPEN TWO MONTHS', again.length === 2,
        `${again.length} periods after a second read`);
} finally {
  await tidy();
}

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
