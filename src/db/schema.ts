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
  /**
   * A secret token while this business is an unclaimed LOOK-AROUND, and null once it is somebody's.
   *
   * Somebody who has not signed up can be given a real business to walk through — the house is
   * viewed before it is bought. Their browser holds this token and nothing else; it is the only
   * thing that opens this tenant without a sign-in. Clearing it at sign-up is what stops an old
   * browser from still reaching a business once it belongs to a real customer.
   */
  lookId: text('look_id'),
  programRequestedAt: text('program_requested_at'),
  stripeCustomerId: text('stripe_customer_id'),        // set on first Checkout Session; reused for the billing portal
  stripeSubscriptionId: text('stripe_subscription_id'), // set on checkout.session.completed; used to match invoice/subscription webhooks back to a tenant
  /**
   * How often the board actually sits. Monthly is what SPEC recommends and what the rhythm is built
   * around; quarterly is the outer limit, offered because a board that meets quarterly and reports
   * honestly beats one that agrees to monthly and then doesn't sit.
   */
  boardCadence: text('board_cadence').notNull().default('monthly'), // monthly | quarterly
  /**
   * basic | advanced — decided by one question to the leader: "Do you want the power of AI?"
   *
   *   basic    — no connectors, no assistant. Every number is typed in and confirmed by a name.
   *   advanced — systems feed the KPIs, every figure is traceable, and Claude is on every page.
   *
   * Defaults to `basic` because manual is a complete and permanent way to run SPEC, not a lesser
   * one: nothing should switch itself on for a business that has not asked for it.
   */
  tier: text('tier').notNull().default('basic'),
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
  /**
   * The "take your seat" link, which the engine requires to be single use, expiring, and bound to
   * one address (designs/the-rules.md §11).
   *
   * The invitation used to be a bare link to /signin, which is none of those three: anybody who saw
   * the email could follow it, it never stopped working, and it proved nothing about who was
   * holding it. A token here makes the seat the invitation is for the seat they actually take.
   */
  seatToken: text('seat_token'),
  seatTokenExpires: text('seat_token_expires'),
  acceptedAt: text('accepted_at'),
  /**
   * quiet | normal | everything — how much SPEC interrupts this person. See lib/notify.
   *
   * Null means never chosen, which reads as `normal`. Stored against the person rather than the
   * business because the answer is genuinely personal: the setting that keeps a site supervisor
   * informed buries a managing director.
   */
  notifyLevel: text('notify_level'),
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
  /**
   * Set when this connection belongs to ONE PERSON rather than to the business — mail, and only
   * mail. A mailbox is not the company's to switch on, so a personal connection is made by the
   * person themselves, visible only to them, and withdrawn by them. Null is the ordinary case: a
   * business connection an administrator turned on.
   */
  personalFor: text('personal_for').references(() => users.id),
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
 * The tickets, licences, checks and signed papers a person or a role is obliged to hold.
 *
 * This is the evidence under the Clear to Work gate. Until now the gate could only be failed by an
 * overdue training module, which meant a business could pass it with an expired forklift licence in
 * a drawer — the exact situation the gate exists to catch. An obligation with a date in the past
 * blocks the person, in the same pass-or-fail way and with no percentage anywhere near it.
 *
 * Held against a PERSON or a ROLE, never both:
 *
 *   A person holds their own licence — it travels with them between jobs and between businesses.
 *   A role carries what the job requires — an insurance certificate, a signed authority — and
 *   whoever holds the role inherits it, the same way the training path does.
 *
 * `expiresAt` may be null, and that is not a gap: a signed employment contract does not expire.
 * What is never allowed is a date SPEC invented, which is why nothing is defaulted here.
 */
export const obligations = pgTable('obligations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** What it is, in the words the business uses. "White card", not "certification type 3". */
  what: text('what').notNull(),
  staffId: text('staff_id').references(() => staff.id),
  userId: text('user_id').references(() => users.id),
  roleId: text('role_id').references(() => roles.id),
  /** Null means it does not expire — a signed contract, an induction that stands. */
  expiresAt: text('expires_at'),
  /** Where the paper actually lives, in their words. Never a file SPEC holds. */
  evidence: text('evidence'),
  createdAt: text('created_at').notNull(),
}, t => [index('obligations_tenant').on(t.tenantId)]).enableRLS();

/**
 * Who is away, and when.
 *
 * Deliberately not a leave management system. SPEC does not calculate entitlements, does not hold
 * balances and does not replace payroll — the business already has something that does. What it
 * holds is the one thing the four questions need and payroll will not tell them: **who is not here,
 * and what that leaves uncovered.**
 *
 * That is a People question and an Earnings question at once. A supervisor away for a fortnight
 * with nobody signed off to cover the role is a gap in the chart, and the chart is the thing SPEC
 * actually reasons about.
 */
export const leaveEntries = pgTable('leave_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  staffId: text('staff_id').references(() => staff.id),
  userId: text('user_id').references(() => users.id),
  /** annual | sick | unpaid | parental | other — their words for it, from a short fixed list. */
  kind: text('kind').notNull().default('annual'),
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  /** requested | approved | declined. A decline is a real outcome with a name against it. */
  state: text('state').notNull().default('requested'),
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  /** Who is covering, if anybody is. Free text: it is usually a name, sometimes "nobody yet". */
  coveredBy: text('covered_by'),
  createdAt: text('created_at').notNull(),
}, t => [index('leave_tenant').on(t.tenantId)]).enableRLS();

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
  /**
   * open | submitted | locked.
   *
   * `submitted` is the month handed up for sign-off: still editable by whoever has to correct
   * something, but declared finished by the person accountable for it. Locking is a separate,
   * deliberate act — a person's decision, never a date.
   */
  status: text('status').notNull().default('open'),
  submittedBy: text('submitted_by'),
  submittedAt: text('submitted_at'),
  /** Signed by the board, or by whoever sits at the top of the chart where there is no board seat. */
  signedBy: text('signed_by'),
  signedAt: text('signed_at'),
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

/**
 * The conversation on a month's card, per role.
 *
 * A score without its reasoning is a number somebody has to take on trust. Comments travel with the
 * month to sign-off and into the board pack, which is why they are kept against the period rather
 * than against the role: what was said in August belongs to August.
 */
export const scorecardComments = pgTable('scorecard_comments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  periodId: text('period_id').notNull().references(() => periods.id),
  /** The name and title as they stood when it was written. History is not re-signed. */
  author: text('author').notNull(),
  authorUserId: text('author_user_id').references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('scorecard_comments_role_period').on(t.roleId, t.periodId)]).enableRLS();

export const gates = pgTable('gates', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().references(() => periods.id),
  gate: text('gate').notNull(),              // zero_harm | clear_to_work | star
  value: text('value').notNull(),
  pass: boolean('pass').notNull(),
  reason: text('reason'),
}, t => [uniqueIndex('gates_unique').on(t.periodId, t.gate)]).enableRLS();

/**
 * Things one person has asked another to decide.
 *
 * Only the ones that genuinely need a record live here — a board approving a sensitive connector,
 * money, a target being renegotiated. Everything else on the approvals queue is DERIVED from the
 * state it is about: a month waiting to be signed is a period with status `submitted`, not a row
 * somebody remembered to create. Deriving what can be derived is what stops the queue drifting out
 * of step with the business.
 */
export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** connection | spend | kpi_change | other — what kind of decision this is. */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  /** Exactly what is being asked for, including the data scope where one applies. */
  detail: text('detail').notNull(),
  /** What is held up while this waits. An approval with no consequence is not urgent, and says so. */
  blocks: text('blocks'),
  /** The level entitled to decide: board | administrator | manager. */
  decidedByLevel: text('decided_by_level').notNull().default('board'),
  requestedBy: text('requested_by').notNull(),
  requestedAt: text('requested_at').notNull(),
  state: text('state').notNull().default('waiting'), // waiting | approved | declined
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  /** Free-form id of whatever this is about — a connection, a role. Never dereferenced blindly. */
  refId: text('ref_id'),
}, t => [index('approvals_tenant_state').on(t.tenantId, t.state)]).enableRLS();

/**
 * Somebody being considered for a role.
 *
 * Rated against the same four pillars the role is scored on, because the alternative is a gut feel
 * nobody can defend three months later — and because hiring against the pillars is what makes the
 * scorecard mean something on day one rather than at the first review.
 *
 * Deliberately thin. SPEC is not an applicant tracking system; this is enough to know who is in
 * front of you, against which role, and on what evidence.
 */
export const candidates = pgTable('candidates', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  name: text('name').notNull(),
  /** applied | screening | interview | offer | placed | declined */
  stage: text('stage').notNull().default('applied'),
  /** 1–5 against each pillar, as JSON {safety,people,earnings,compliance}. Null until rated. */
  ratings: text('ratings'),
  /** What was actually checked — a licence, a ticket, a right to work. The business's own words. */
  checks: text('checks'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
}, t => [index('candidates_tenant_role').on(t.tenantId, t.roleId)]).enableRLS();

/**
 * The improvement register — a problem somebody said out loud, and what happened to it.
 *
 * The same row whether it was typed by a stranger on the front door or by a supervisor on My Page,
 * which is the point: a problem raised before anybody had an account is not a different kind of
 * thing from one raised in month six.
 *
 * Nothing here is ever deleted. A closed problem becomes history a business can look back on, and
 * the count of how many times one came back is the number worth being frightened by — see
 * `recurrenceCount` and `reopenCount`. Both are the signal a business is least able to see about
 * itself, because each individual raising feels small at the time.
 *
 * People are held as NAMES rather than staff ids on purpose. An entry outlives the person who
 * raised it, the role they held, and sometimes the org chart itself; pointing at a row that can be
 * moved or removed would mean history quietly changing, which every other rule in SPEC forbids.
 */
export const registerEntries = pgTable('register_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** What the person typed, in their own words. Never rewritten, never tidied. */
  text: text('text').notNull(),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),

  /** The causal chain, as JSON [{pillar, certainty}]. Order is the chain, not a ranking. */
  bloom: text('bloom').notNull().default('[]'),
  /** The fix, as JSON pillar names, always in People → Compliance → Earnings order. */
  chain: text('chain').notNull().default('[]'),
  /** What the diagnosis said, in one line each, for the card. */
  errorLine: text('error_line'),
  solutionLine: text('solution_line'),
  /** The story gave no clear owner, so the only honest fix is finding one. */
  noOwner: boolean('no_owner').notNull().default(false),

  /** open | done | closed. Done is marked by the owner; closed is signed off in the weekly meeting. */
  status: text('status').notNull().default('open'),
  owner: text('owner'),
  /** null = not answered, true = accepted, false = denied as not theirs. */
  accepted: boolean('accepted'),
  deadline: text('deadline'),
  recurrenceCount: integer('recurrence_count').notNull().default(1),
  reopenCount: integer('reopen_count').notNull().default(0),
  signedOffAt: text('signed_off_at'),
}, t => [index('register_tenant_status').on(t.tenantId, t.status)]).enableRLS();

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
  actions: text('actions'),                  // JSON [{id, text, owner, due, done, pillar}]
  /**
   * Who was in the room, as JSON names. Attendance is part of whether the meeting happened at all:
   * a senior meeting the senior group did not attend is a note, not a meeting.
   */
  attendees: text('attendees'),              // JSON [name]
  /**
   * What was decided, as JSON [{text, who, at}]. Kept separately from the minutes because a
   * decision outlives the week it was made in — "decisions nobody remembers" is the thing the
   * rhythm exists to fix.
   */
  decisions: text('decisions'),
}).enableRLS();

export const boardOutputs = pgTable('board_outputs', {
  id: text('id').primaryKey(),
  periodId: text('period_id').notNull().unique().references(() => periods.id),
  markdown: text('markdown').notNull(),
  generatedBy: text('generated_by').notNull().default('claude'),
  approvedBy: text('approved_by'),
  /**
   * Sent back rather than approved, and what the board wants changed.
   *
   * A board that can only approve is not reviewing anything. The pack is the month's account of
   * itself, and a director who thinks it is wrong needs somewhere to say so that is not a phone
   * call nobody else hears — so a refusal is recorded on the pack, with a reason, and the leader
   * sees exactly what to fix.
   */
  sentBackBy: text('sent_back_by'),
  sentBackAt: text('sent_back_at'),
  sentBackReason: text('sent_back_reason'),
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

/**
 * Uptime and response time, measured rather than claimed.
 *
 * The cockpit used to have nowhere honest to get these, so it said so. This is the fix: a scheduled
 * request calls /api/ping every five minutes, that route times a real database round-trip, and the
 * result lands here. One row per check — 288 a day, pruned at thirty days.
 *
 * The subtlety worth writing down: **a failed check cannot record itself.** If the app is down,
 * nothing runs and nothing is written. So uptime is never counted as successes over rows; it is
 * successes over the checks that SHOULD have happened in the window, and a missing row counts
 * against it. That is the only way this measures the thing people think it measures.
 *
 * It also means a missing row can mean the scheduler did not fire rather than the site being down,
 * which is a real limitation and is stated on the page rather than hidden by it.
 */
export const healthPings = pgTable('health_pings', {
  id: text('id').primaryKey(),
  /** ISO timestamp of the check. */
  at: text('at').notNull(),
  /** Did the app answer, and reach its database? */
  ok: boolean('ok').notNull(),
  /** How long the round-trip took, in milliseconds. */
  ms: integer('ms').notNull(),
  /** What went wrong, when something did. Never a connection string. */
  note: text('note'),
}, t => [index('health_pings_at').on(t.at)]).enableRLS();
/*
  RLS ON with no policy, which denies EVERYONE — deliberately, and unlike any other table here.

  This holds no tenant data, so tenant isolation is meaningless for it; and unlike rulebook_rules
  there is nobody it should be readable by. Only SPEC itself writes it (as the role that owns the
  table, which Postgres lets bypass RLS) and only /cockpit reads it. Denying by default means it
  stays invisible through PostgREST, the Supabase table editor, and anything that ever connects as
  `anon` — without anybody having to remember to write a rule for it.
*/
