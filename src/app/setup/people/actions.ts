'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assignPerson } from '@/lib/provision';

export async function assign(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const roleId = String(formData.get('roleId'));
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!name || !email) redirect('/setup/people');
  const u = await assignPerson(user.tenantId, roleId, { name, email });
  db.update(schema.users).set({ invitedAt: new Date().toISOString() }).where(eq(schema.users.id, u.id)).run();
  revalidatePath('/setup/people'); revalidatePath('/org'); revalidatePath('/journey');
}
