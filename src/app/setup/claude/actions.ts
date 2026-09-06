'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';

export async function registerClaude(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const path = String(formData.get('path'));
  const workspaceName = String(formData.get('workspaceName') ?? '').trim() || null;
  const seatsConfirmed = formData.get('seatsConfirmed') === 'on';
  const now = new Date().toISOString();
  const existingRows = await db.select().from(schema.claudeRegistrations).where(eq(schema.claudeRegistrations.tenantId, user.tenantId));
  const existing = existingRows[0];
  const row = { tenantId: user.tenantId, path, workspaceName, seatsConfirmed, confirmedBy: seatsConfirmed ? user.email : null, confirmedAt: seatsConfirmed ? now : null };
  if (existing) await db.update(schema.claudeRegistrations).set(row).where(eq(schema.claudeRegistrations.tenantId, user.tenantId));
  else await db.insert(schema.claudeRegistrations).values(row);
  redirect(seatsConfirmed ? '/journey' : '/setup/claude');
}
