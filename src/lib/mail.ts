/**
 * Mail, and the tasks it created.
 *
 * The narrowest section on My Page, and the narrowness is the design. What belongs here is mail
 * that matches something already on this person's card — a KPI, an action, a named job, somebody on
 * their team — with the task each piece created sitting under it.
 *
 * **It must never become an inbox.** Nobody needs a second email system, and the moment mail floats
 * free of the thing it is about, SPEC becomes another place to check rather than the place the work
 * happens. The test is that **the list ends**: everything that did not match something on the card
 * stays in the mail system it came from, untouched.
 *
 * And the mailbox belongs to the person, not the business, so this is the one connection an
 * administrator cannot make on somebody's behalf. It is entirely optional — a person who connects
 * nothing loses a convenience and no part of the method.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { MAIL_PROVIDERS, type MailProviderId } from './systems';

export { MAIL_PROVIDERS, type MailProviderId };

export interface MailConnection {
  id: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
}

/** This person's own mail connection, if they made one. Nobody else can see it. */
export async function myMail(tenantId: string, userId: string): Promise<MailConnection | null> {
  const [row] = await db.select()
    .from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, tenantId),
      eq(schema.systemConnections.category, 'communications'),
      eq(schema.systemConnections.personalFor, userId),
    ));
  return row ? { id: row.id, name: row.name, status: row.status, lastSyncAt: row.lastSyncAt } : null;
}

/**
 * Point SPEC at a mailbox.
 *
 * Recorded as `requested` rather than `live`: nothing is actually reading anybody's mail until the
 * provider's own consent screen has been through, and saying "connected" before that would be a
 * lie about where somebody's email is going.
 */
export async function connectMyMail(tenantId: string, userId: string, ownerName: string, provider: MailProviderId) {
  const existing = await myMail(tenantId, userId);
  const name = MAIL_PROVIDERS.find(p => p.id === provider)?.name ?? 'Mail';
  if (existing) {
    await db.update(schema.systemConnections)
      .set({ name, status: 'requested' })
      .where(eq(schema.systemConnections.id, existing.id));
    return;
  }
  await db.insert(schema.systemConnections).values({
    id: randomUUID(),
    tenantId,
    name,
    category: 'communications',
    ownerName,
    ownerIsSelf: true,
    personalFor: userId,
    status: 'requested',
    createdAt: new Date().toISOString(),
  });
}

/** Withdraw it. The person's own decision, and it takes effect immediately. */
export async function disconnectMyMail(tenantId: string, userId: string) {
  await db.delete(schema.systemConnections).where(and(
    eq(schema.systemConnections.tenantId, tenantId),
    eq(schema.systemConnections.category, 'communications'),
    eq(schema.systemConnections.personalFor, userId),
  ));
}

/**
 * Business connections — everything that is not somebody's personal mailbox.
 *
 * Used by the Connections page so a person's mail never appears in the business's list, which would
 * both break the rule and be unsettling to find there.
 */
export async function businessConnections(tenantId: string) {
  return db.select().from(schema.systemConnections).where(and(
    eq(schema.systemConnections.tenantId, tenantId),
    isNull(schema.systemConnections.personalFor),
  ));
}
