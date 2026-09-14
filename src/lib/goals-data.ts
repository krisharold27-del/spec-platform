import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { GOAL_PROMPT_IDS, fitAnswer, type Goal } from './goals';

/**
 * Reading and writing the goals. The questions and the rules they are judged by are in lib/goals.
 */

/** Every goal this business has answered. Order is applied by the caller, from GOAL_PROMPTS. */
export async function goalsFor(tenantId: string): Promise<Goal[]> {
  const rows = await db.select().from(schema.businessGoals)
    .where(eq(schema.businessGoals.tenantId, tenantId));
  return rows.map(r => ({ promptId: r.promptId, answer: r.answer, updatedAt: r.updatedAt }));
}

/**
 * Save the answers, one row per prompt.
 *
 * An emptied answer DELETES its row rather than storing an empty string, and the difference is what
 * `goalsAnswered` reads: a business that has cleared all three should go back to being one that has
 * not answered, not one carrying three blanks that still count as set.
 *
 * Only known prompt ids are written. The form posts field names, and a field name is user input —
 * without this filter an extra posted key becomes a row nothing will ever read or show.
 *
 * The existing rows are read ONCE, before the loop. Reading per prompt would be three round trips to
 * save three text boxes, which is the small version of the fault that had the org chart running a
 * query per role.
 */
export async function saveGoals(
  tenantId: string,
  answers: Record<string, string>,
  by: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const current = new Map(
    (await db.select().from(schema.businessGoals).where(eq(schema.businessGoals.tenantId, tenantId)))
      .map(r => [r.promptId, r]),
  );

  for (const promptId of GOAL_PROMPT_IDS) {
    if (!(promptId in answers)) continue;
    const { answer } = fitAnswer(answers[promptId] ?? '');
    const row = current.get(promptId);

    if (!answer) {
      if (row) await db.delete(schema.businessGoals).where(eq(schema.businessGoals.id, row.id));
      continue;
    }
    if (row) {
      if (row.answer === answer) continue; // nothing changed; do not touch updatedAt
      await db.update(schema.businessGoals)
        .set({ answer, updatedAt: now, updatedBy: by })
        .where(eq(schema.businessGoals.id, row.id));
    } else {
      await db.insert(schema.businessGoals).values({
        id: crypto.randomUUID(), tenantId, promptId, answer, updatedAt: now, updatedBy: by,
      });
    }
  }
}
