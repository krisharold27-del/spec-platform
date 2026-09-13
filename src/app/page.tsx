import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';

export const dynamic = 'force-dynamic';

/**
 * The front door, and the front door only.
 *
 * SPEC has exactly two homes and this page decides which one you are at:
 *
 *   Not signed in → /welcome. The landing page is the first thing anybody searching for SPEC sees,
 *                   and it has to be, because nothing else on the site explains what this is.
 *
 *   Signed in     → My Page. **Every day starts here.** The whole system branches out of it — the
 *                   week, the month, approvals, the chart, everything — and it is where somebody
 *                   opening SPEC with a coffee should land without navigating.
 *
 * This used to be the Executive Summary, which put the wrong screen at the address people type. The
 * summary is a monthly, whole-business read for whoever runs the place; My Page is what one person
 * does today. Making the second one home is the difference between a product somebody opens every
 * morning and a dashboard they visit when they remember to.
 *
 * The Executive Summary now lives at /summary, linked from the menu and from Group.
 */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? DEFAULT_AFTER_SIGN_IN : '/welcome');
}
