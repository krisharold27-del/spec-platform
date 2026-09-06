import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function Me() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const a = db.select().from(schema.roleAssignments).where(and(eq(schema.roleAssignments.userId, user.id), isNull(schema.roleAssignments.toDate))).get();
  redirect(a ? `/scorecard/${a.roleId}` : '/journey');
}
