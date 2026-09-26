'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

/** Approve or set aside a fix siteVIP listening proposed. Kris only, checked here, not trusted from the page. */
export async function decideListening(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) redirect('/my-page');
  const id = String(form.get('id') ?? '').slice(0, 64);
  const state = form.get('decision') === 'approve' ? 'approved' : 'set_aside';
  await db.update(schema.listeningNotes)
    .set({ state, decidedAt: new Date().toISOString() })
    .where(and(eq(schema.listeningNotes.id, id), eq(schema.listeningNotes.state, 'proposed')));
  revalidatePath('/cockpit');
  redirect('/cockpit#listening');
}
