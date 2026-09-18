import { redirect } from 'next/navigation';
import { desc, eq, and } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The board pack, without having to know which month.
 *
 * The pack itself lives at `/board/[periodId]`, and until now the only way to reach it was a link at
 * the bottom of Executive summary that appears once a month is locked. That is fine as a route and
 * useless as a destination: the navigation bar names *Board pack*, and a menu item cannot ask you
 * which period id you meant.
 *
 * So this is the door. It opens the most recently CLOSED month, because a board pack is a record of
 * a month that finished — an open month has nothing settled in it to report. If no month has been
 * closed yet, Executive summary is the honest place to land: it shows the month that is running, and
 * says what is still to be marked.
 */
export default async function BoardPackDoor() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const [latest] = await db.select({ id: schema.periods.id })
    .from(schema.periods)
    .where(and(eq(schema.periods.tenantId, user.tenantId), eq(schema.periods.status, 'locked')))
    .orderBy(desc(schema.periods.period))
    .limit(1);

  redirect(latest ? `/board/${latest.id}` : '/summary?pack=none');
}
