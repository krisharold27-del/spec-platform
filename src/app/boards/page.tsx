import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * `/boards` is where Mirrors used to live.
 *
 * Design 11 renamed the feature: *Boards* became *Mirrors*, because "board" in SPEC already means
 * the company's Board — the pack, the charter, the four commitments — and one word cannot mean both
 * a governance body and a live artifact a crew pins a rate card to.
 *
 * The old address is kept and forwards, with whatever was on it. A renamed thing is not a deleted
 * thing: somebody has this in a browser tab, in a bookmark, in a Slack message to their supervisor,
 * and a rename that answers those with "page not found" teaches a customer that SPEC loses things.
 * It carries the query string over so a link to one particular board still opens that board.
 */
export default async function BoardsMoved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') query.set(k, v);
    else if (Array.isArray(v) && v[0]) query.set(k, v[0]);
  }
  const tail = query.toString();
  redirect(tail ? `/mirrors?${tail}` : '/mirrors');
}
