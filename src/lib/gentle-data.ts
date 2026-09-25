/**
 * Recording what somebody confirmed, and showing their leader the pattern.
 *
 * The confirmations are the whole safety net of `lib/gentle`. Nothing is blocked, so the only thing
 * that makes a gentle prompt more than a speed bump is that "Yes, it's right" is written down — and
 * that five of them in a fortnight become a conversation rather than five separate Tuesdays.
 */
import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import { patterns, PATTERN_AT, type Confirmed, type GentleKey, type Pattern } from './gentle';

const KEYS: GentleKey[] = ['under_cost', 'hours_mismatch', 'leave_over', 'long_day', 'invoice_differs', 'own_spend', 'deleting'];
const isKey = (v: string): v is GentleKey => (KEYS as string[]).includes(v);

/** Somebody pressed "Yes, it's right". Kept, never acted on. */
export async function recordConfirmation(input: {
  tenantId: string; promptKey: string; who: string; what: string; about?: string | null;
}): Promise<void> {
  if (!isKey(input.promptKey)) return;
  await db.insert(schema.gentleConfirmations).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    promptKey: input.promptKey,
    who: input.who,
    what: input.what,
    about: input.about ?? null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * What the leader sees.
 *
 * Only patterns, never individual confirmations. One confirmed fourteen-hour day is a Tuesday and
 * showing it to a leader would turn a gentle prompt into surveillance — which would make people
 * stop answering honestly, which would make the prompts worthless.
 */
export async function patternsFor(tenantId: string): Promise<Pattern[]> {
  try {
    const rows = await db.select()
      .from(schema.gentleConfirmations)
      .where(eq(schema.gentleConfirmations.tenantId, tenantId))
      .orderBy(desc(schema.gentleConfirmations.createdAt))
      .limit(500);

    const confirmed: Confirmed[] = rows
      .filter(r => isKey(r.promptKey))
      .map(r => ({ key: r.promptKey as GentleKey, who: r.who, at: r.createdAt, what: r.what }));

    return patterns(confirmed);
  } catch {
    return [];
  }
}

export { PATTERN_AT };
