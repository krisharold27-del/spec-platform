import { redirect } from 'next/navigation';
import { getCurrentUser, canManage, type CurrentUser } from './auth';
import { refuseWrite } from './plan';
import { isLookTenant } from './look';

/**
 * The gate every action that changes something starts at.
 *
 * ── Why it exists ────────────────────────────────────────────────────────────────────────────────
 *
 * Twenty-six actions opened with the same line: get the user, and if they cannot manage, send them
 * to the sign-in page. For a visitor having a look around that is the wrong answer to the right
 * question. They are sat in the top role's chair with `readonly` access, so the check refuses them —
 * correctly — and posts them to /signin, which sees somebody already signed in and forwards them to
 * My Page.
 *
 * So a stranger three minutes into evaluating SPEC clicked **Add**, and arrived on a different page
 * with nothing whatever said. Not an error, not a message, just somewhere else. They would conclude
 * the button is broken, and they would be half right.
 *
 * Worse, it meant the look-around never reached `assertWritable` for any of these actions at all.
 * READINESS has said for a fortnight that a visitor cannot write because of that one chokepoint. It
 * was true that they could not write. It was not true that this was what stopped them — and the
 * look-around journey, which was cited as the proof, had never once tried to save anything.
 *
 * So the look is asked about FIRST, and answered with a sentence instead of a door.
 */
export async function requireManager(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user && (await isLookTenant(user.tenantId))) await refuseWrite('look');
  if (!user || !canManage(user.access)) redirect('/signin');
  return user;
}
