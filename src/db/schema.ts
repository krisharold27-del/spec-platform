/**
 * SPEC platform data model — see docs/SPEC_Platform_Build_Plan.md §4.
 * Drizzle ORM on Postgres (Supabase). RLS is enabled on every tenant-scoped table; the actual
 * policies are defined in drizzle/0001_rls.sql (see that file for why raw SQL, not drizzle-kit push).
 * Rule: roles are defined by what the business needs; people are assigned to roles, never the reverse.
 */
import { pgTable, text, integer, real, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sector: text('sector'),
  startDate: text('start_date').notNull(),
  status: text('status').notNull().default('active'), // active | paused | closed
  plan: text('plan').notNull().default('trial'),      // trial | basic (self-serve, ~$100/yr) | program (rollout + training, principal on site) | lapsed
  programRequestedAt: text('program_requested_at'),
  stripeCustomerId: text('stripe_customer_id'),        // set on first Checkout Session; reused for the billing portal
  stripeSubscriptionId: text('stripe_subscription_id'), // set on checkout.session.completed; used to match invoice/subscription webhooks back to a tenant
  /**
   * How often the board actually sits. Monthly is what SPEC recommends and what the rhythm is built
   * around; quarterly is the outer limit, offered because a board that meets quarterly and reports
   * honestly beats one that agrees to monthly and then doesn't sit.
   */
  boardCadence: text('board_cadence').notNull().default('monthly'), // monthly | quarterly
}).enableRLS();

/**
 * Who sits on the board. Governance is part of Compliance, not an administrative afterthought: a
 * board that cannot say who its directors are, or when it last met, has a compliance gap whatever
 * the safety numbers say.
 */
export const directors = pgTable('directors', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  title: text('title'),                    // Chair, Non-executive director, Owner...
  appointedAt: text('appointed_at'),
  active: boolean('active').notNull().default(true),
}, t => [index('directors_tenant').on(t.tenantId)]).enableRLS();

// One row per app user, linked to a Supabase Auth identity via authUserId (auth.users.id).
// A person may hold roles in more than one tenant (e.g. a consultant); one row per tenant+email.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  authUserId: text('auth_user_id'), // set on first sign-in via the Supabase Auth callback; null until then
  email: text('email').notNull(),
  name: text('name').notNull(),
  /**
   * administrator | full | readonly
   *  - administrator: seats, grants, region/currency/financial year, entities, chart confirmation,
   *    the recovery contact. Administration, not management — scope still limits what they manage.
   *  - full: manages KPIs and marks within their own scope (own role and everything beneath it).
   *  - readonly: sees their own card in full, including the working, and comments on their month.
   * Stored value stays 'readonly' (not 'read_only') so no data migration is needed.
   */
  access: text('access').notNull().default('readonly'),
  invitedAt: text('invited_at'),
  acceptedAt: text('accepted_at'),
}, t => [uniqueIndex('users_tenant_email').on(t.tenantId, t.email), index('users_auth_user').on(t.authUserId)]).enableRLS();

/**
 * The systems a client already runs, so their KPIs can read real numbers instead of being typed in.
 *
 * Deliberately not a fixed vendor list: `name` is whatever the client typed — their job system, their accounts package,
 * a spreadsheet on a shared drive — because every business runs a different stack. `category` is
 * what the number is FOR, which is the part SPEC actually reasons about.
 *
 * `ownerEmail` matters because the person setting SPEC up is usually not the person who administers
 * the accounting system. When they name someone else, that person is invited for this one job.
 *
 * A broken connection is never shown to the wider business: the KPI falls back to a manual
 * met/not-met toggle and only the owner is told, quietly.
 */
export const systemConnections = pgTable('system_connections', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),            // free text, exactly as the client named it
  category: text('category').notNull(),    // job_management | financials | safety | crm | payroll | other
  ownerName: text('owner_name'),
  ownerEmail: text('owner_email'),
  ownerIsSelf: boolean('owner_is_self').notNull().default(true),
  status: text('status').notNull().default('requested'), // requested | invited | live | broken
  lastSyncAt: text('last_sync_at'),
  lastErrorAt: text('last_error_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('system_connections_tenant').on(t.tenantId)]).enableRLS();

// The deployment journey, one row per step per tenant. See docs/SPEC_Deployment_Journey.md.
export const journeySteps = pgTable('journey_steps', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  stepId: text('step_id').notNull(),       // e.g. claude_registration, question_zero, roles, kpis, people
  status: text('status').notNull().default('todo'), // todo | in_progress | done | blocked
  note: text('note'),
  completedBy: text('completed_by'),
  completedAt: text('completed_at'),
}, t => [uniqueIndex('journey_tenant_step').on(t.tenantId, t.stepId)]).enableRLS();

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  stream: text('stream').notNull(),          // gm | commercial | operations | growth | board
  level: text('level').notNull(),            // gm | manager | supervisor | staff
  defaultAccess: text('default_access').notNull().default('readonly'), // administrator | full | readonly
  reportsToRoleId: text('reports_to_role_id'), // org chart: roles report to roles
  pnlView: text('pnl_view'),                 // operational_ebitda | controllable_net_profit | full_statutory
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, t => [index('roles_tenant').on(t.tenantId)]).enableRLS();

/**
 * The staff directory — names before they are accounts.
 *
 * A leader drafts the business by writing down who is where, and that has to cost nothing and send
 * nothing. A staff row is just a name: no login, no email, no seat. It becomes a user only when the
 * leader is confident enough in the structure to send an invite, which is also the moment it bills.
 */
export const staff = pgTable('staff', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  /** Set once invited. Until then this person has no account and costs nothing. */
  userId: text('user_id').references(() => users.id),
  createdAt: text('created_at').notNull(),
}, t => [index('staff_tenant').on(t.tenantId)]).enableRLS();

/**
 * Who holds a role, over time. Assignments are opened and closed, never deleted, so the chart can
 * always answer "who held this role in March".
 *
 * Both userId and staffId are nullable because an assignment has two stages: pencilled in (staffId
 * only — free, invisible to the person) and live (userId set once they are invited).
 */
export const roleAssignments = pgTable('role_assignments', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull().references(() => roles.id),
  userId: text('user_id').references(() => users.id),
  staffId: text('staff_id').references(() => staff.id),
  fromDate: text('from_date').notNull(),
  toDate: text('to_date'),
  /**
   * The training path signed off by this person's manager: trained on the job and confirmed
   * capable in THIS role. It hangs off the placement rather than the person, so moving somebody to
   * a different role correctly does not carry their sign-off across — which is the whole point of
   * "trained on the role, not the software".
   */
  trainedAt: text('trained_at'),
  trainedBy: text('trained_by'),
}, t => [index('ra_role').on(t.roleId), index('ra_user').on(t.userId), index('ra_staff').on(t.staffId)]).enableRLS();

/**
 * SPEC's own training — the catalogue a business draws its role paths from.
 *
 * Every module is tied to a pillar, and through it to the KPIs a role is already scored on: the
 * training exists to move a number somebody is accountable for, not to explain the software. A
 * `core` module is one every role starts with and no manager can remove.
 */
export const trainingModules = pgTable('training_modules', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  /** safety | people | earnings | compliance | all — 'all' is a module that serves every pillar. */
  pillar: text('pillar').notNull(),
  minutes: integer('minutes').notNull().default(30),
  core: boolean('core').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, t => [index('training_modules_tenant').on(t.tenantId)]).enableRLS();

/**
 * Which modules a role requires. Role first, person second: the path belongs to the job, and
 * whoever holds the job inherits it. Reassigning a person never edits the path.
 */
export const roleCurriculum = pgTable('role_curriculum', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull().references(() => roles.id),
  moduleId: text('module_id').notNull().references(() => trainingModules.id),
  /** Days from taking the role to when this module is due. Null means no deadline. */
  dueDays: integer('due_days'),
  sortOrder: integer('sort_order').notNull().default(0),
}, t => [uniqueIndex('role_curriculum_unique').on(t.roleId, t.moduleId), index('role_curriculum_role').on(t.roleId)]).enableRLS();

/**
 * One person's progress through one module.
 *
 * Progress is the person's — somebody learns a thing once — while WHICH modules count is the
 * role's, resolved through the path above. That split is what lets a path be reported by role
 * without making a person re-sit the same module every time the chart changes.
 */
export const trainingRecords = pgTable('training_records', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  moduleId: text('module_id').notNull().references(() => trainingModules.id),
  userId: text('user_id').references(() => users.id),
  staffId: text('staff_id').references(() => staff.id),
  /** 0–100. 100 is complete; anything between is started and not finished. */
  progress: integer('progress').notNull().default(0),
  /** The mark, where the module carries one. Null is "no mark", never zero. */
  resultPct: integer('result_pct'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
}, t => [
  uniqueIndex('training_records_user_module').on(t.userId, t.moduleId),
  index('training_records_tenant').on(t.tenantId),
]).enableRLS();

export const criteria = pgTable('criteria', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull().references(() => roles.id),
  pillar: text('pillar').notNull(),          // safety | people | earnings | compliance
  text: text('text').notNull(),
  weight: real('weight').notNull(),          // 0–1; weights within a pillar sum to 1
  kpi: boolean('kpi').notNull().default(false),
  target: text('target'),                    // agreed target
  proposedTarget: text('proposed_target'),   // what was first proposed — negotiation is recorded, not hidden
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, t => [index('criteria_role_pillar').on(t.roleId, t.pillar)]).enableRLS();

export const periods = pgTable('assessment_periods', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  period: text('period').notNull(),          // YYYY-MM
  status: text('status').notNull().default('open'), // open | locked
}, t => [uniqueIndex('periods_tenant_period').on(t.tenantId, t.period)]).enableRLS();

// Append-only per period. Locked periods are never edited.
export const assessments = pgTable('assessments', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().references(() => periods.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  criterionId: text('criterion_id').notNull().references(() => criteria.id),
  // `answer` stays the scoring value (Y | N | NA | ''); `status` is the label the business
  // actually uses and is what the person picks. See lib/status.ts for the mapping — Watch and
  // Not met both score as N, Pending and Not tracked are excluded from scoring entirely.
  answer: text('answer').notNull().default(''), // Y | N | NA | ''
  status: text('status'),   // confirmed | on_track | met | watch | not_met | pending | not_tracked
  result: text('result'),   // the actual value, as reported: "$827,172 (94.0%)", "40.24%", "16 invoices"
  source: text('source'),   // where the number came from: "Accounts package, plain actual", "Manual - GM confirmation"
  note: text('note'),
  enteredBy: text('entered_by'),
  enteredAt: text('entered_at').notNull(),
}, t => [uniqueIndex('assessments_unique').on(t.periodId, t.roleId, t.criterionId)]).enableRLS();

export const gates = pgTable('gates', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().references(() => periods.id),
  gate: text('gate').notNull(),              // zero_harm | clear_to_work | star
  value: text('value').notNull(),
  pass: boolean('pass').notNull(),
  reason: text('reason'),
}, t => [uniqueIndex('gates_unique').on(t.periodId, t.gate)]).enableRLS();

export const diagnostics = pgTable('diagnostics', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sectionId: text('section_id').notNull(),   // matches seed/diagnostic.json
  questionId: text('question_id').notNull(),
  answer: text('answer').notNull(),
  answeredBy: text('answered_by'),
  answeredAt: text('answered_at').notNull(),
}, t => [index('diag_tenant_section').on(t.tenantId, t.sectionId)]).enableRLS();

export const meetings = pgTable('meetings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type').notNull(),              // sog | board
  date: text('date').notNull(),
  minutes: text('minutes'),
  actions: text('actions'),                  // JSON [{text, owner, due, done}]
}).enableRLS();

export const boardOutputs = pgTable('board_outputs', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().unique().references(() => periods.id),
  markdown: text('markdown').notNull(),
  generatedBy: text('generated_by').notNull().default('claude'),
  approvedBy: text('approved_by'),
  createdAt: text('created_at').notNull(),
}).enableRLS();

// Cross-client learnings. Never contains client names or figures. Global (no tenant_id) — RLS not needed.
export const rulebookRules = pgTable('rulebook_rules', {
  id: text('id').primaryKey(),
  phase: text('phase').notNull(),
  pattern: text('pattern').notNull(),
  action: text('action').notNull(),
  version: text('version').notNull(),
});

export const rolesRelations = relations(roles, ({ one, many }) => ({
  reportsTo: one(roles, { fields: [roles.reportsToRoleId], references: [roles.id], relationName: 'org' }),
  reports: many(roles, { relationName: 'org' }),
  criteria: many(criteria),
  assignments: many(roleAssignments),
}));
export const criteriaRelations = relations(criteria, ({ one }) => ({ role: one(roles, { fields: [criteria.roleId], references: [roles.id] }) }));
export const roleAssignmentsRelations = relations(roleAssignments, ({ one }) => ({
  role: one(roles, { fields: [roleAssignments.roleId], references: [roles.id] }),
  user: one(users, { fields: [roleAssignments.userId], references: [users.id] }),
}));
