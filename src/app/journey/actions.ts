'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';

export async function requestProgram() {
  const user = await getCurrentUser(); if (!user || !canManage(user.access)) redirect('/signin');
  await db.update(schema.tenants).set({ programRequestedAt: new Date().toISOString() }).where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/journey');
}
