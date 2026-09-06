/**
 * SPEC platform data model — see docs/SPEC_Platform_Build_Plan.md §4.
 * Drizzle ORM. Dev runs on SQLite (file); production on Postgres (Supabase) with RLS by tenant_id.
 * Rule: roles are defined by what the business needs; people are assigned to roles, never the reverse.
 */
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sector: text('sector'),
  startDate: text('start_date').notNull(),
  status: text('status').notNull().default('active'), // active | paused | closed
  plan: text('plan').notNull().default('basic'),      // basic (self-serve, ~$100/yr) | program (rollout + training, principal on site)
  programRequestedAt: text('program_requested_at'),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  access: text('access').notNull().default('readonly'), // full | readonly
  invitedAt: text('invited_at'),
  acceptedAt: text('accepted_at'),
}, t => [uniqueIndex('users_tenant_email').on(t.tenantId, t.email)]);

// Dev sessions. Production swaps this for Supabase Auth (see src/lib/auth.ts).
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
});

// Claude registration is a hard gate before the journey opens.
export const claudeRegistrations = sqliteTable('claude_registrations', {
  tenantId: text('tenant_id').primaryKey().references(() => tenants.id),
  path: text('path').notNull(),            // own_workspace | needs_setup
  workspaceName: text('workspace_name'),
  seatsConfirmed: integer('seats_confirmed', { mode: 'boolean' }).notNull().default(false),
  confirmedBy: text('confirmed_by'),
  confirmedAt: text('confirmed_at'),
});

// The deployment journey, one row per step per tenant. See docs/SPEC_Deployment_Journey.md.
export const journeySteps = sqliteTable('journey_steps', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  stepId: text('step_id').notNull(),       // e.g. claude_registration, question_zero, roles, kpis, people
  status: text('status').notNull().default('todo'), // todo | in_progress | done | blocked
  note: text('note'),
  completedBy: text('completed_by'),
  completedAt: text('completed_at'),
}, t => [uniqueIndex('journey_tenant_step').on(t.tenantId, t.stepId)]);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  stream: text('stream').notNull(),          // gm | commercial | operations | growth | board
  level: text('level').notNull(),            // gm | manager | supervisor | staff
  defaultAccess: text('default_access').notNull().default('readonly'),
  reportsToRoleId: text('reports_to_role_id'), // org chart: roles report to roles
  pnlView: text('pnl_view'),                 // operational_ebitda | controllable_net_profit | full_statutory
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
}, t => [index('roles_tenant').on(t.tenantId)]);

export const roleAssignments = sqliteTable('role_assignments', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull().references(() => roles.id),
  userId: text('user_id').notNull().references(() => users.id),
  fromDate: text('from_date').notNull(),
  toDate: text('to_date'),
}, t => [index('ra_role').on(t.roleId), index('ra_user').on(t.userId)]);

export const criteria = sqliteTable('criteria', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull().references(() => roles.id),
  pillar: text('pillar').notNull(),          // safety | people | earnings | compliance
  text: text('text').notNull(),
  weight: real('weight').notNull(),          // 0–1; weights within a pillar sum to 1
  kpi: integer('kpi', { mode: 'boolean' }).notNull().default(false),
  target: text('target'),                    // agreed target
  proposedTarget: text('proposed_target'),   // what was first proposed — negotiation is recorded, not hidden
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
}, t => [index('criteria_role_pillar').on(t.roleId, t.pillar)]);

export const periods = sqliteTable('assessment_periods', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  period: text('period').notNull(),          // YYYY-MM
  status: text('status').notNull().default('open'), // open | locked
}, t => [uniqueIndex('periods_tenant_period').on(t.tenantId, t.period)]);

// Append-only per period. Locked periods are never edited.
export const assessments = sqliteTable('assessments', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().references(() => periods.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  criterionId: text('criterion_id').notNull().references(() => criteria.id),
  answer: text('answer').notNull().default(''), // Y | N | NA | ''
  note: text('note'),
  enteredBy: text('entered_by'),
  enteredAt: text('entered_at').notNull(),
}, t => [uniqueIndex('assessments_unique').on(t.periodId, t.roleId, t.criterionId)]);

export const gates = sqliteTable('gates', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().references(() => periods.id),
  gate: text('gate').notNull(),              // zero_harm | clear_to_work | star
  value: text('value').notNull(),
  pass: integer('pass', { mode: 'boolean' }).notNull(),
  reason: text('reason'),
}, t => [uniqueIndex('gates_unique').on(t.periodId, t.gate)]);

export const diagnostics = sqliteTable('diagnostics', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sectionId: text('section_id').notNull(),   // matches seed/diagnostic.json
  questionId: text('question_id').notNull(),
  answer: text('answer').notNull(),
  answeredBy: text('answered_by'),
  answeredAt: text('answered_at').notNull(),
}, t => [index('diag_tenant_section').on(t.tenantId, t.sectionId)]);

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type').notNull(),              // sog | board
  date: text('date').notNull(),
  minutes: text('minutes'),
  actions: text('actions'),                  // JSON [{text, owner, due, done}]
});

export const boardOutputs = sqliteTable('board_outputs', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().unique().references(() => periods.id),
  markdown: text('markdown').notNull(),
  generatedBy: text('generated_by').notNull().default('claude'),
  approvedBy: text('approved_by'),
  createdAt: text('created_at').notNull(),
});

// Cross-client learnings. Never contains client names or figures.
export const rulebookRules = sqliteTable('rulebook_rules', {
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
