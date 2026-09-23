'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/guard';
import { getScope } from '@/lib/scope';
import { assertWritable, syncSubscriptionSeats } from '@/lib/plan';

/**
 * "Do you want SPEC AI powered?" lived here for one day, 22 September, then was retired — Kris,
 * looking at the built result: *"i also feel like i don't want to have 2 different prices... make
 * it simple."* There is one seat price again (see lib/pricing), so there is nothing left for a
 * business to choose between. See DECISIONS.md, 22 September.
 */

/**
 * "Bring the subscription into line" — the fix offered beside the notice on /billing when the live
 * subscription charges something other than the page's own bill (see `checkSubscription`).
 *
 * The same push every chart edit already makes, on demand. It exists because nothing else runs it
 * when the RULE changes rather than the chart: the free seat moving to the first leadership seat
 * (23 September) changed what every subscribed business owes without anybody editing anything, so
 * each subscription stayed on the old count until somebody happened to edit that business's chart.
 * Same gate as `setSeatKind` — the leadership-seat rule — because it is the same decision.
 */
export async function resyncSubscription() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  const scope = await getScope(user);
  if (!scope.canInvite) {
    redirect(`/billing?cannot=${encodeURIComponent('Only somebody on a leadership seat can change what the business is billed.')}`);
  }
  const outcome = await syncSubscriptionSeats(user.tenantId);
  revalidatePath('/billing');
  redirect(`/billing?seat_sync=${outcome.status}`);
}
