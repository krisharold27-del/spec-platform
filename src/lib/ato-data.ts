/**
 * Subbies, their ABNs, and what SPEC paid them — for the ATO section on Compliance.
 *
 * The ABN check lives on the subcontractor's existing compliance checks (`lib/subbies` has carried
 * an `abn` kind since the subbies work), so there is one record of it rather than two that can
 * disagree. What Design 19 adds is validating the number, treating a stale look-up as no look-up,
 * and refusing the payment on the strength of it.
 */
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { NO_ABN_CHECK, type AbnCheck, type TestKey, type Answer, type TparRow } from './ato';
import type { AtoSubbie } from '../app/compliance/ato-panel';

export interface AtoView {
  subbies: AtoSubbie[];
  tparRows: TparRow[];
  year: string;
}

/** The financial year a date falls in, named the way a business names it. */
export function taxYearOf(now: Date): string {
  const y = now.getUTCFullYear();
  /* July to June. A date in January belongs to the year that started the previous July. */
  return now.getUTCMonth() >= 6 ? `${y}–${String(y + 1).slice(2)}` : `${y - 1}–${String(y).slice(2)}`;
}

export async function atoFor(tenantId: string, now: Date = new Date()): Promise<AtoView> {
  let subbieRows: { id: string; name: string }[] = [];
  try {
    subbieRows = await db.select({ id: schema.subcontractors.id, name: schema.subcontractors.business })
      .from(schema.subcontractors).where(eq(schema.subcontractors.tenantId, tenantId));
  } catch {
    return { subbies: [], tparRows: [], year: taxYearOf(now) };
  }
  if (subbieRows.length === 0) return { subbies: [], tparRows: [], year: taxYearOf(now) };

  const ids = subbieRows.map(s => s.id);
  const checks = await db.select()
    .from(schema.subbieChecks)
    .where(inArray(schema.subbieChecks.subbieId, ids));

  const subbies: AtoSubbie[] = subbieRows.map(s => {
    const abnCheck = checks.find(c => c.subbieId === s.id && c.kind === 'abn');
    const abn: AbnCheck = abnCheck
      ? {
        /*
          The number itself lives in the check's note — `subbie_checks` records that a check was
          done and what it was against, and the ABN is what the note carries for this kind.
        */
        abn: abnCheck.note?.trim() ?? null,
        registeredTo: s.name,
        /*
          Current from the check's own expiry, if it has one. Absent expiry reads as current — the
          business recorded the check and did not put a date on it, which is different from a check
          that has lapsed.
        */
        current: !abnCheck.expiresAt || abnCheck.expiresAt >= now.toISOString().slice(0, 10),
        gstRegistered: false,
        checkedAt: abnCheck.updatedAt ?? null,
      }
      : NO_ABN_CHECK;

    return {
      id: s.id,
      name: s.name,
      abn,
      /*
        The four ATO tests are not recorded yet, so every subbie reads as unanswered — which says
        "one on its own says nothing at all" rather than leaning either way. Honest: SPEC has not
        been told, and an unanswered test must never read as a passed one.
      */
      answers: {} as Partial<Record<TestKey, Answer>>,
    };
  });

  return { subbies, tparRows: [], year: taxYearOf(now) };
}
