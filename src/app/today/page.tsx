import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * The old address for My Page.
 *
 * The page was always called "My page" and always lived at /today, which is the kind of small
 * mismatch that makes a product feel like it was assembled rather than designed. It is /my-page now.
 *
 * This stays because addresses outlive the reasons for them: bookmarks, the installed app's start
 * page, a link in an email somebody sent a colleague last month. Silently landing them where they
 * meant to go costs one file; a dead link on the page somebody opens every morning costs their
 * confidence in the whole thing.
 */
export default async function Today() {
  redirect('/my-page');
}
