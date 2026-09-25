import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { credentialFor } from './xero-link';
import type { LedgerConnection } from './virtual-gm-overview';

/**
 * The business's accounting connections, as the Virtual GM's financial panel needs them.
 *
 * Business connections only — never a person's mailbox — in the one category SPEC reads rather than
 * replaces (see READS_ONLY in lib/connected-data). Whether a credential is held is asked of
 * `credentialFor`, which never returns the sealed token, so nothing here can carry a key to somebody's
 * books into a render.
 */
export async function ledgerConnections(tenantId: string): Promise<LedgerConnection[]> {
  const rows = await db.select({
    id: schema.systemConnections.id,
    name: schema.systemConnections.name,
    status: schema.systemConnections.status,
  })
    .from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, tenantId),
      eq(schema.systemConnections.category, 'financials'),
      isNull(schema.systemConnections.personalFor),
    ));

  return Promise.all(rows.map(async r => {
    const credential = await credentialFor(tenantId, r.id);
    return {
      name: r.name,
      status: r.status,
      linked: Boolean(credential),
      orgName: credential?.xeroOrgId ? credential.orgName ?? 'the chosen books' : null,
    };
  }));
}
