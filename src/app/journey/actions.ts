'use server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';

export async function requestProgram() {
  const user = await requireManager();
  await db.update(schema.tenants).set({ programRequestedAt: new Date().toISOString() }).where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/journey');
}
