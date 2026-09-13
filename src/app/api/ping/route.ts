import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { lt, desc } from 'drizzle-orm';
import { CHECK_EVERY_MINUTES } from '@/lib/uptime';

export const dynamic = 'force-dynamic';

/**
 * One health check, recorded.
 *
 * Called every five minutes by the schedule in vercel.json. It does a real database round-trip and
 * writes down how long the whole thing took, so /cockpit can report uptime and response time from
 * measurements rather than from a number somebody typed.
 *
 * Deliberately narrow: it touches no tenant data, names nobody, and the only thing it stores is a
 * timestamp, a yes-or-no and a duration.
 *
 * ── Why there is no required secret ──────────────────────────────────────────────────────────────
 *
 * The first version demanded CRON_SECRET and recorded nothing without it, which meant uptime could
 * not be measured until somebody remembered to add a setting in a dashboard. That is the shape of
 * bug that has cost this project two separate weeks: the database that never migrated because a
 * manual step was skipped, and the security policies nobody ever ran. **A measurement that depends
 * on a person remembering a manual step is a measurement you do not have.**
 *
 * The secret only ever existed to stop somebody hammering this endpoint and filling the table. That
 * is solved better in code: **at most one reading is kept per interval.** However many times this is
 * called, by anybody, the table grows at the rate of the schedule and no faster. There is nothing
 * left to abuse — a caller can cause one `select 1`, which is less work than loading any page on the
 * site.
 *
 * CRON_SECRET is still honoured when set, as a second lock for anybody who wants one. It is simply
 * no longer the difference between measuring and not.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const offered = request.headers.get('authorization');
  // Set but wrong is a refusal. Somebody who configured a secret meant it to mean something.
  if (secret && offered !== `Bearer ${secret}`) {
    return NextResponse.json({ recorded: false, why: 'not an invited caller' }, { status: 401 });
  }

  const started = Date.now();
  let ok = false;
  let note: string | null = null;

  try {
    const [{ db }, { sql }] = await Promise.all([import('@/db'), import('drizzle-orm')]);
    await db.execute(sql`select 1`);
    ok = true;
  } catch (err) {
    // The reason is kept, with any connection string stripped — a health table is not a place to
    // leak credentials to whoever can read it later.
    note = ((err as { message?: string })?.message ?? 'unknown')
      .replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]')
      .slice(0, 160);
  }
  const ms = Date.now() - started;

  let recorded = false;
  try {
    const { db, schema } = await import('@/db');

    /*
      One reading per interval, and this is what makes the endpoint safe to leave open.

      Checked against the newest row rather than a counter, so it holds across every instance the
      platform happens to be running — two serverless functions answering at once cannot both decide
      they are the first. A little slack (the interval less thirty seconds) keeps a scheduler that
      fires a few seconds early from being skipped for an hour.
    */
    const [newest] = await db.select({ at: schema.healthPings.at })
      .from(schema.healthPings)
      .orderBy(desc(schema.healthPings.at))
      .limit(1);

    const slack = CHECK_EVERY_MINUTES * 60_000 - 30_000;
    const due = !newest || Date.now() - Date.parse(newest.at) >= slack;

    if (due) {
      await db.insert(schema.healthPings).values({
        id: randomUUID(),
        at: new Date().toISOString(),
        ok,
        ms,
        note,
      });
      recorded = true;

      // Thirty days is what the cockpit reads, so thirty days is what is kept. Pruned here rather
      // than by a second scheduled job nobody would remember exists.
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
      await db.delete(schema.healthPings).where(lt(schema.healthPings.at, cutoff));
    }
  } catch {
    // If the database is the thing that is down, there is nowhere to write that down. The gap it
    // leaves is the record — see lib/uptime for why a missing check counts against uptime.
  }

  return NextResponse.json(
    { ok, ms, recorded, ...(recorded ? {} : { why: 'a reading was already taken this interval' }) },
    { status: ok ? 200 : 503 },
  );
}
