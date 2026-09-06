'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assignPerson } from '@/lib/provision';
import { sendInviteEmail } from '@/lib/email';

export async function assign(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const roleId = String(formData.get('roleId'));
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!name || !email) redirect('/setup/people');

  const roleRows = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
  const role = roleRows[0];

  const u = await assignPerson(user.tenantId, roleId, { name, email });
  const wasAlreadyInvited = !!u.invitedAt;
  await db.update(schema.users).set({ invitedAt: new Date().toISOString() }).where(eq(schema.users.id, u.id));

  const tenantRows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const tenant = tenantRows[0];
  if (!wasAlreadyInvited && tenant && role) {
    await sendInviteEmail({ to: email, name, businessName: tenant.name, roleTitle: role.title });
  }

  revalidatePath('/setup/people'); revalidatePath('/org'); revalidatePath('/journey');
}
