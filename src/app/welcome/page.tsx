import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * The old address for the landing page.
 *
 * The landing page is now simply specbizhq.com. This stays because addresses outlive the reasons
 * for them — a link in an email, a bookmark, an advert already printed.
 */
export default async function Welcome() {
  redirect('/');
}
