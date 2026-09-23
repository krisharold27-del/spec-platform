import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { getScope, type Scope } from './scope';
import { canSeeDeal } from './crm';
import { buildClients, buildContacts, suppliersFrom, type Client, type Contact, type JobIn, type OrgIn, type PersonIn, type DealIn } from './clients';

/**
 * The client list and contacts, read for one viewer. Every decision is in lib/clients.
 *
 * Organisations, people and jobs are the business's shared list — the way a job's client always
 * was. Deals are still only the viewer's line's (`canSeeDeal`, the same walk as every scorecard), so
 * a client's "open deals" is the ones this viewer may see.
 */
export interface ClientsView {
  scope: Scope;
  clients: Client[];
  contacts: Contact[];
  organisations: OrgIn[];
  people: PersonIn[];
  jobs: JobIn[];
  deals: DealIn[];
}

export async function loadClients(user: CurrentUser): Promise<ClientsView> {
  const scope = await getScope(user);
  const [organisations, people, allDeals, jobs, items] = await Promise.all([
    db.select().from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, user.tenantId)),
    db.select().from(schema.crmPeople).where(eq(schema.crmPeople.tenantId, user.tenantId)),
    db.select().from(schema.crmDeals).where(eq(schema.crmDeals.tenantId, user.tenantId)),
    db.select().from(schema.jobs).where(eq(schema.jobs.tenantId, user.tenantId)),
    db.select({ supplier: schema.catalogueItems.supplier }).from(schema.catalogueItems)
      .where(eq(schema.catalogueItems.tenantId, user.tenantId)),
  ]);
  const deals = allDeals.filter(d => canSeeDeal(d.ownerRoleId, scope.visible, user.access));
  const clients = buildClients({ organisations, people, deals, jobs });
  const contacts = buildContacts(clients, people, deals, jobs, suppliersFrom(items));
  return { scope, clients, contacts, organisations, people, jobs, deals };
}
