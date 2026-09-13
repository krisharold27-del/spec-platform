import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { lt } from 'drizzle-orm';

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
 * **Protected, because it writes.** Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled
 * requests. Without CRON_SECRET set, the route answers but records nothing — a public endpoint that
 * lets anybody fill a table is a denial-of-service waiting to be noticed, and an unprotected one
 * that silently no-ops is better than one that refuses and makes /cockpit look broken.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const offered = request.headers.get('authorization');
  const invited = Boolean(secret) && offered === `Bearer ${secret}`;

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

  if (!invited) {
    // Answer honestly, record nothing. Says why, so a misconfigured schedule is findable.
    return NextResponse.json(
      { ok, ms, recorded: false, why: secret ? 'not an invited caller' : 'CRON_SECRET is not set' },
      { status: ok ? 200 : 503 },
    );
  }

  try {
    const { db, schema } = await import('@/db');
    await db.insert(schema.healthPings).values({
      id: randomUUID(),
      at: new Date().toISOString(),
      ok,
      ms,
      note,
    });

    // Thirty days is what the cockpit reads, so thirty days is what is kept. 288 rows a day, pruned
    // here rather than by a second scheduled job nobody would remember exists.
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await db.delete(schema.healthPings).where(lt(schema.healthPings.at, cutoff));
  } catch {
    // If the database is the thing that is down, there is nowhere to write that down. The gap it
    // leaves is the record — see lib/uptime for why a missing check counts against uptime.
  }

  return NextResponse.json({ ok, ms, recorded: true }, { status: ok ? 200 : 503 });
}
