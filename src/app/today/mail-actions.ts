'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { connectMyMail, disconnectMyMail, MAIL_PROVIDERS, type MailProviderId } from '@/lib/mail';

/**
 * Connecting a mailbox — deliberately NOT an administrator's action.
 *
 * Every other connection in SPEC goes through `assertAdministrator`, and the sensitive ones through
 * the board. This one goes through neither, because a mailbox belongs to a person rather than to
 * the business. There is no version of this where somebody else switches on your email, and the
 * absence of that check is the feature rather than an oversight.
 *
 * `assertWritable` still applies: a visitor looking around writes nothing, ever.
 */
async function me() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

export async function connectMail(formData: FormData) {
  const user = await me();
  const provider = String(formData.get('provider') ?? '') as MailProviderId;
  if (!MAIL_PROVIDERS.some(p => p.id === provider)) return;
  await connectMyMail(user.tenantId, user.id, user.name, provider);
  revalidatePath('/today');
}

export async function disconnectMail() {
  const user = await me();
  await disconnectMyMail(user.tenantId, user.id);
  revalidatePath('/today');
}
