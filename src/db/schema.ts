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
   * This business's incentive ceilings, as JSON keyed by level. Null means the published ladder.
   *
   * The ladder — 250 apprentice, 500 technician, 750 specialist, 1,000 supervisor, 2,000 manager,
   * 4,000 GM — is a SUGGESTION, and the rules say so: "Ceilings are defaults, not law." Without
   * somewhere to keep a business's own numbers, every customer was silently locked to ours, which
   * turns a recommendation into a rule nobody agreed to. A trade business in one state and a
   * services business in another do not pay the same, and SPEC has no business pretending they do.
   */
  ceilings: text('ceilings'),
  /**
   * basic | advanced — decided by one question to the leader: "Do you want the power of AI?"
   *
   *   basic    — no connectors, no assistant. Every number is typed in and confirmed by a name.
   *   advanced — systems feed the KPIs, every figure is traceable, and Claude is on every page.
   *
   * Defaults to `basic` because manual is a complete and permanent way to run SPEC, not a lesser
   * one: nothing should switch itself on for a business that has not asked for it.
   */
  // Advanced by default: the first seat is free and whole. See provisionTenant.
  tier: text('tier').notNull().default('advanced'),
  /**
   * Which of the four things this business is buying — see PACKAGES in lib/pricing.
   *
   *   seat            one person in SPEC
   *   seat_training   the same, plus the training built into SPEC
   *   sessions        four one-hour sessions a month, delivered by SPEC
   *   full_control    a full day a week, and the board meeting chaired
   *
   * Set by the administrator, never by the customer: the last two are a share of one person's week
   * and cannot be bought by clicking. Defaults to `seat`, which is the only one that needs nothing
   * from anybody to deliver.
   */
  package: text('package').notNull().default('seat'),
  /**
   * Retired 22 September, the same day it was built — no longer read by anything.
   *
   * Built earlier that day to hold a per-business answer to "do you want SPEC AI powered?" — two
   * prices for the same leadership seat, A$134 against A$227. Kris, looking at the built result:
   * *"i also feel like i don't want to have 2 different prices... make it simple."* There was never
   * a second product behind the second price — `aiActive` in lib/plan already switches the
   * assistant on for every subscribed business regardless of this column — so the choice this
   * column recorded stopped meaning anything the same day it shipped.
   *
   * Kept in the schema rather than dropped, the same way `tier` above is: migrations here are
   * additive by design (see scripts/deploy-migrate), and removing a column on the way past is how a
   * rollback becomes data loss. See DECISIONS.md, 22 September.
   */
  seatTier: text('seat_tier').notNull().default('basic'),
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

/**
 * What the business is actually for — answered before a single role or KPI exists.
 *
 * Design export 5 made this Setup step one: "before a single role or KPI, the owner or director says
 * what winning looks like. Every target Claude proposes later gets checked against this — a KPI that
 * doesn't serve one of these goals is a KPI worth questioning."
 *
 * ── Why a table rather than three columns on tenants ─────────────────────────────────────────────
 *
 * Three columns would carve the three questions into the schema, and the questions are the part most
 * likely to move — a fourth prompt, or a different set for a sector, would become a migration rather
 * than an edit to a list. `promptId` keys an answer to its question in lib/goals, so the wording can
 * change without the data moving, and an answer survives its prompt being retired. That last part
 * matters: these are the owner's own words about their own business, not form fields.
 *
 * One row per prompt per tenant, enforced by the unique index rather than by code remembering to.
 */
export const businessGoals = pgTable('business_goals', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** Which question this answers — see GOAL_PROMPTS in lib/goals. */
  promptId: text('prompt_id').notNull(),
  /** The leader's answer, in their own words. SPEC reads it and never rewrites it. */
  answer: text('answer').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by'),
}, t => [
  index('business_goals_tenant').on(t.tenantId),
  uniqueIndex('business_goals_tenant_prompt').on(t.tenantId, t.promptId),
]).enableRLS();

/**
 * Roles SPEC thinks the structure is missing — proposals, never roles.
 *
 * Design export 5: "Claude's read of what this structure is still missing. Nothing here counts as
 * real until you say so — approve to add it to the chart, deny to drop it."
 *
 * ── Why a separate table and not a flag on roles ─────────────────────────────────────────────────
 *
 * A proposal is not a role that happens to be switched off. A role has KPIs, a scorecard, a place in
 * the roll-up and a line in the org chart; a proposal has none of those and must never accidentally
 * acquire them. Keeping them apart means every query that walks the business — the chart, the
 * roll-up, the incentive chain, the seat count — cannot see a prediction at all, without a single
 * one of them having to remember to filter it out. That is the difference between a rule and a
 * habit, and habits are what leak.
 *
 * It also lets a DENIED proposal be remembered. Proposing the same Yard Lead every month after
 * somebody has said no is how software teaches people to ignore it.
 */
export const predictedRoles = pgTable('predicted_roles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  /** Where it would sit. Null means nothing sensible to hang it off — shown, never guessed at. */
  parentRoleId: text('parent_role_id').references(() => roles.id),
  /** Why this role, in terms of THIS business. A proposal without a reason is noise. */
  why: text('why').notNull(),
  /** The stream and level it would be created at, so approving it is one step rather than a form. */
  stream: text('stream').notNull(),
  level: text('level').notNull(),
  /** pending | approved | denied. Denied ones stay, so the same proposal is not made twice. */
  state: text('state').notNull().default('pending'),
  /**
   * Where it came from: `claude` or `structure`.
   *
   * Shown to the leader, because the two deserve different amounts of trust. The structural reading
   * is arithmetic on their own chart — a stream with no head, a pillar nobody owns — and is right or
   * wrong for reasons anybody can check. Claude's is a judgement. Labelling them the same would
   * quietly borrow the credibility of the one for the other.
   */
  source: text('source').notNull().default('structure'),
  proposedAt: text('proposed_at').notNull(),
  decidedAt: text('decided_at'),
  decidedBy: text('decided_by'),
  /** The role that was created when this was approved, so the trail from proposal to seat is kept. */
  roleId: text('role_id').references(() => roles.id),
}, t => [
  index('predicted_roles_tenant').on(t.tenantId),
  // One live proposal per title per business. Without this, two runs of the reading propose the
  // same Yard Lead twice and the leader is asked to approve it two days running.
  uniqueIndex('predicted_roles_tenant_title').on(t.tenantId, t.title),
]).enableRLS();

/**
 * The goal, broken into what each role has to actually move.
 *
 * Design export 5: "The goal only means something once it is broken into what each role has to
 * actually move. This is that cascade, once structure is approved."
 *
 * ── Why these are proposals and not criteria ─────────────────────────────────────────────────────
 *
 * A criterion on a role is a thing somebody is SCORED on, and the target on it was agreed with the
 * person who holds the seat — "a target is agreed with whoever holds the role, never imposed on
 * them." A cascade row is SPEC's suggestion about what would serve the goal, which is a different
 * object with a different status, and writing it straight into `criteria` would have quietly turned
 * a suggestion into a measurement nobody consented to.
 *
 * Adopting one creates a criterion with `proposedTarget` set and `target` still empty, so the
 * negotiation the product already records — see lib/boards, which reports how many targets were
 * agreed exactly as proposed — happens the same way it does for any other KPI.
 */
export const cascadeKpis = pgTable('cascade_kpis', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  pillar: text('pillar').notNull(),
  /** What the role would measure — becomes the criterion's text. */
  metric: text('metric').notNull(),
  /** The number suggested. Lands on the criterion as proposedTarget, never as the agreed target. */
  target: text('target').notNull(),
  /** How this serves the goal, in terms of THIS business. A cascade row without it is a guess. */
  why: text('why').notNull(),
  /** pending | adopted | dismissed. Dismissed ones stay, so the same row is not proposed twice. */
  state: text('state').notNull().default('pending'),
  /** claude | structure — the same honesty the predicted roles carry. */
  source: text('source').notNull().default('structure'),
  proposedAt: text('proposed_at').notNull(),
  decidedAt: text('decided_at'),
  decidedBy: text('decided_by'),
  /** The criterion created on adoption, so the trail from goal to scorecard is kept. */
  criterionId: text('criterion_id').references(() => criteria.id),
}, t => [
  index('cascade_kpis_tenant').on(t.tenantId),
  uniqueIndex('cascade_kpis_role_metric').on(t.roleId, t.metric),
]).enableRLS();

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
  /**
   * On SPEC's own training material — a leadership seat upgraded to the training price rather than
   * the plain one.
   *
   * Against the PERSON, not the business. `tenants.package` could only ever mean "everybody pays
   * the training price", which for a business of forty with six leaders would have charged it for
   * thirty-four people nobody is training. Set by the administrator, and only for somebody holding
   * a leadership seat — see `eligibleForTrainingSeat` in lib/pricing.
   */
  trainingSeat: boolean('training_seat').notNull().default(false),
  /**
   * An administrator's explicit override of which seat this person is billed on — 'leadership' |
   * 'team' | null.
   *
   * Everywhere else, `seatKindFor` (lib/chart-seats) is the only truth: a title, or somebody
   * reporting to the role. Kris, 23 September, asked for a way past that — *"we need the capacity
   * to choose whether leadership seat or team seat when sending their email to join"* — after a
   * misclassified seat on JBI's own chart. Deliberately narrower than "ignore the chart": null
   * (the default, and the only value anybody has until an administrator touches this) means
   * nothing has changed — billing keeps reading the chart live, exactly as it always has, and
   * self-corrects when a role's title or reporting line changes. A non-null value is a stated
   * choice, made once by an administrator, and it OUTLIVES the chart until an administrator changes
   * it again or sets it back to null — `resolveSeatKind` (lib/chart-seats) is the one place that
   * decides which of the two wins, and every caller that bills or grants training goes through it.
   */
  seatKindOverride: text('seat_kind_override'), // leadership | team | null
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
   * What they agreed to, and when — the record, not the tick.
   *
   * A tick is not evidence of anything a week later. The question that gets asked is "what did they
   * agree to", and only the VERSION answers it: the page gets edited, and somebody who signed up in
   * March agreed to the March words. Stored at the moment of agreement, alongside the timestamp.
   *
   * Null for a person who has not agreed yet — every account made before this existed, and anybody
   * part-way through taking a seat. Null means unknown, never "agreed to version 1".
   */
  termsVersion: text('terms_version'),
  termsAcceptedAt: text('terms_accepted_at'),
  /**
   * quiet | normal | everything — how much SPEC interrupts this person. See lib/notify.
   *
   * Null means never chosen, which reads as `normal`. Stored against the person rather than the
   * business because the answer is genuinely personal: the setting that keeps a site supervisor
   * informed buries a managing director.
   */
  notifyLevel: text('notify_level'),
  /**
   * How the rest of the business reaches this person, and the day they started with it — the staff
   * list (People → Staff list, 23 September). Additive and optional: empty is "not recorded", never
   * invented. The start date falls back to the person's first placement on the chart when unset.
   * A plain directory, visible to everybody in the business; nothing here is a score.
   */
  phone: text('phone'),
  startDate: text('start_date'),
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

/**
 * The credential behind a connection, sealed.
 *
 * Its own table rather than columns on `system_connections`, for two reasons that are both about
 * blast radius. A connection row is read on My Page, on Connections, by the J curve and by the
 * automation review; a credential is read by exactly one thing, at the moment of a fetch. Keeping
 * them apart means the common query cannot accidentally carry a token into a page render or a log
 * line. And a dump of `system_connections` — which is ordinary business structure — stops being a
 * dump of everybody's accounts.
 *
 * `refreshTokenSealed` is AES-256-GCM (see lib/secret-box) and is NEVER written in the clear. The
 * access token is deliberately not stored at all: it lasts thirty minutes, so keeping it buys one
 * fetch and adds a second secret at rest.
 *
 * `xeroOrgId` is what Xero's own API calls `tenantId`. Renamed here so the word "tenant" in this
 * codebase only ever means a SPEC customer — see the note at the top of lib/xero.
 */
export const connectionCredentials = pgTable('connection_credentials', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  connectionId: text('connection_id').notNull().references(() => systemConnections.id),
  /** Which vendor this is for. One row per connection; `xero` is the first. */
  provider: text('provider').notNull(),
  /** Xero's organisation id, sent as the Xero-tenant-id header. Not a SPEC tenant. */
  xeroOrgId: text('xero_org_id'),
  /** The organisation's name as Xero gave it, so a person can tell which books these are. */
  orgName: text('org_name'),
  /**
   * Every organisation the consent covers, as JSON, when there is more than one.
   *
   * A Xero login often reaches several sets of books — a group, a trust, an accountant's practice
   * with twenty clients on it. SPEC cannot know which one is this business's, and picking the first
   * would put somebody else's accounts on a scorecard. So the choices are kept, the administrator
   * says which, and until they have, `xeroOrgId` is null and nothing can be read at all.
   */
  orgChoices: text('org_choices'),
  /** Sealed. See lib/secret-box. A plaintext token here would be sixty days of somebody's accounts. */
  refreshTokenSealed: text('refresh_token_sealed').notNull(),
  /** What the consent actually covers, as Xero granted it — never what we asked for. */
  scope: text('scope'),
  /** When the refresh token itself dies. Xero gives sixty days and rotates on every use. */
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, t => [
  index('connection_credentials_tenant').on(t.tenantId),
  uniqueIndex('connection_credentials_connection').on(t.connectionId),
]).enableRLS();

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
  /**
   * What this role covers, in the business's own word for it.
   *
   * A general role made specific without being redefined. "Sales Supervisor" is the same job with
   * the same measures in every business; what changes is what it sells — Solar at JBI Electrical,
   * New Homes or Service Contracts somewhere else. The focus is substituted into the role's title
   * and into its criteria wherever the template wrote {focus}.
   *
   * Null is normal, and means the role needs no qualifier: a General Manager is a General Manager.
   */
  focus: text('focus'),
  pnlView: text('pnl_view'),                 // operational_ebitda | controllable_net_profit | full_statutory
  /**
   * A TEAM rather than a seat: several people, pooled, with one shared scorecard between them.
   *
   * Design 15's team layer — "Technicians" and "Apprentices" hanging under a Site Supervisor, each
   * holding a handful of names and one set of S/P/E/C for the group.
   *
   * ── Why a team is a role and not a new table ────────────────────────────────────────────────
   *
   * Everything a team needs already exists on a role and nowhere else: it reports to somebody, it
   * carries criteria, it is scored each month, it is laid out on the chart — and
   * `role_assignments` has never had a uniqueness constraint on `role_id`, so several people
   * sitting on one role is an already-supported shape rather than something to build.
   *
   * A separate table would have meant a second kind of node for the layout to place, a second kind
   * of parent for a reporting line, a second scoring path and a second set of period rules, all to
   * express "this one holds more than one person". This column is the whole difference.
   *
   * Nobody is billed differently for it. Which seat a person is on is read from the chart and the
   * title (`seatKindFor` in lib/chart-seats) and nothing reports to a team, so everybody in one is
   * a team seat — which is exactly what the design calls them.
   */
  isTeam: boolean('is_team').notNull().default(false),
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
  /**
   * The staff list's contact fields (23 September). Optional, typed by a leader or by the person —
   * a pencilled-in name still has a phone. When the person is later invited, the email here is the
   * one the invitation offers, so the business is never asked for it twice.
   */
  phone: text('phone'),
  email: text('email'),
  /** The day they started with the business, when it is known. ISO date. */
  startDate: text('start_date'),
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
  /**
   * Who wrote it: `business` (the default, and everything that existed before) or `spec`.
   *
   * SPEC's own modules are installed into a business that has somebody on a training seat, and are
   * not the business's to edit or delete — otherwise one business's tidy-up would silently change
   * what it is paying A$44 for.
   */
  source: text('source').notNull().default('business'),
  /**
   * The material itself, for a module that carries any. Plain text, blank line between paragraphs,
   * lines beginning "- " read as points.
   *
   * SPEC's own modules carry it; a business's own modules may, and mostly will not — a module has
   * always been allowed to be a pointer at training that happens elsewhere, and that stays true.
   */
  content: text('content'),
  /**
   * The permanent id from lib/training-library, for SPEC's modules only.
   *
   * It is how an install knows it has already run, and how a module can be improved later without
   * orphaning the progress of everybody who has done it. Null for a module the business wrote.
   */
  libraryId: text('library_id'),
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
/*
  Two indexes, because there are two questions asked of this table.

  The scorecard page asks for one role's comments in one month, which the first index answers. The
  boards page asks for the whole business's, which had nothing and scanned every comment belonging
  to every customer. Found by the tenant-index test rather than by anybody noticing.
*/
}, t => [
  index('scorecard_comments_role_period').on(t.roleId, t.periodId),
  index('scorecard_comments_tenant').on(t.tenantId),
]).enableRLS();

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
/**
 * Rights over a branch of the chart that somebody does not sit above.
 *
 * ── Why this table has to exist at all ───────────────────────────────────────────────────────────
 *
 * Kris, 19 September: *"managers only have rights to their staff - if rights are needed then the
 * admin must approve this"*.
 *
 * The first half was already true and needed nothing: SPEC works out what somebody may touch by
 * walking DOWN the chart from their own role, so a manager reaches their own people and nobody
 * else's. That rule is derived from the chart itself, which is why it has never needed storing and
 * can never drift out of step with the business.
 *
 * The second half has nowhere to live. "This person may also manage that branch" is not a fact
 * about the chart — it is a decision somebody made, on a date, that somebody else has to be able to
 * see and take back. Derived state cannot hold it, so it is stored, and stored with the two things
 * that make it accountable: WHO granted it and WHEN.
 *
 * A grant is never deleted. It is revoked, with a date, for the same reason a placement is closed
 * rather than removed — "who could see the Cobram scorecards in March" is a question a business
 * will eventually have to answer.
 *
 * What it grants is exactly what holding the role would: that role and everything beneath it. There
 * is deliberately no way to grant less, or to grant something other than a branch. A permission
 * model somebody has to reason about is a permission model that gets it wrong.
 */
export const roleGrants = pgTable('role_grants', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** Who may now reach the branch. */
  userId: text('user_id').notNull().references(() => users.id),
  /** The top of the branch they may reach — that role and everybody under it. */
  roleId: text('role_id').notNull().references(() => roles.id),
  /** The administrator who approved it, by name, so the record reads without a join. */
  grantedBy: text('granted_by').notNull(),
  grantedAt: text('granted_at').notNull(),
  /** Set when it is taken back. Never deleted — see above. */
  revokedAt: text('revoked_at'),
}, t => [index('role_grants_tenant_user').on(t.tenantId, t.userId)]).enableRLS();

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
  /*
    Indexed by business, which it was not until a load test at twenty thousand seats found it.

    Every other tenant-scoped table had this and meetings did not, so finding one business's two
    dozen meetings meant Postgres reading every meeting belonging to every customer: 16,008 rows
    read to return 24. It happens on My Page — the screen every customer opens every morning — and
    again on the weekly meeting and the boards.

    This is the shape of failure that matters in a product sold by the seat, because it does not
    look like a bug. Nothing breaks. One business's morning page simply costs a little more every
    time ANOTHER business signs up, so the product gets slower exactly as it succeeds, and the
    customers who feel it first are the ones who have been there longest.
  */
}, t => [index('meetings_tenant').on(t.tenantId)]).enableRLS();

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

/**
 * Cross-client learnings — the method itself. Never a client name, never a figure.
 *
 * ── Global does not mean unprotected ─────────────────────────────────────────────────────────────
 *
 * This said "Global (no tenant_id) — RLS not needed", and that sentence was wrong in a way that
 * took Supabase emailing a CRITICAL alert to find: `rls_disabled_in_public`, "anyone with your
 * project URL can read, edit, and delete all data in this table".
 *
 * No tenant_id means no TENANT policy is needed. It does not mean no RLS. With RLS off in the
 * public schema, PostgREST exposes the table to the anonymous role for select, insert, update AND
 * delete — so "readable by everyone", which was the intent, silently also meant writable and
 * deletable by everyone, which never was.
 *
 * RLS is on now with a SELECT-only policy and no write policy at all. Everyone can still read it,
 * which is the whole point of it being global; nobody but the role that owns the table — which is
 * how SPEC writes it — can change a word.
 */
export const rulebookRules = pgTable('rulebook_rules', {
  id: text('id').primaryKey(),
  phase: text('phase').notNull(),
  pattern: text('pattern').notNull(),
  action: text('action').notNull(),
  version: text('version').notNull(),
}).enableRLS();

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

/**
 * What the leader decided about each measure a process could take on.
 *
 * ── Why the decision is stored and the proposal is not ───────────────────────────────────────────
 *
 * `lib/automation` works out a proposal from the criterion, its target and whether the numbers
 * already arrive from a connected system. That is a derivation: it changes the moment a system is
 * connected or a target is agreed, and storing it would leave the business acting on a verdict that
 * stopped being true weeks ago. So it is computed every time and never written down.
 *
 * What IS written down is the part SPEC has no right to derive — a person's decision about a
 * person's job, with their name and the date on it. `verdict` here overrides the proposal;
 * `hoursPerMonth` is the business saying how long the work actually takes, and is the ONLY source
 * of any hours or dollars figure SPEC will print (see lib/automation.saving).
 *
 * A missing row means undecided, which is a real state and reads as such. It never reads as
 * agreement.
 */
export const roleAutomation = pgTable('role_automation', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  criterionId: text('criterion_id').notNull().references(() => criteria.id),
  /** person | assisted | automated | unknown — the leader's answer, not SPEC's. */
  verdict: text('verdict').notNull(),
  /** How long this takes somebody each month, as the business measured it. Null means nobody said. */
  hoursPerMonth: real('hours_per_month'),
  /** Why the leader landed where they did. Their words, kept so the decision can be revisited. */
  note: text('note'),
  decidedBy: text('decided_by').notNull(),
  decidedAt: text('decided_at').notNull(),
}, t => [uniqueIndex('role_automation_criterion').on(t.criterionId), index('role_automation_tenant').on(t.tenantId)]).enableRLS();

/**
 * The discrete jobs inside a role — the unit the automation engine actually works on.
 *
 * ── Why tasks and not KPIs ───────────────────────────────────────────────────────────────────────
 *
 * A KPI is an OUTCOME — "quote turnaround within 1 day" — and an outcome is not a thing anybody can
 * build. What gets built is the work behind it: read the enquiry, find the roof, size it, price it,
 * send it. Those are tasks, they are what a build brief describes, and one KPI usually rests on
 * several of them. The KPI still decides the ORDER, because a failing one is what makes a task worth
 * doing first — but it is the reason, not the unit.
 *
 * ── Where the rows come from ─────────────────────────────────────────────────────────────────────
 *
 *   `template` — seeded with the role, so no business faces a blank page
 *   `person`   — the role-holder answered the three questions (what do you do each week, what takes
 *                longest, what do you hate)
 *   `intake`   — somebody wrote it into the intake box
 *
 * Kept separate because they deserve different amounts of trust. A template task is SPEC's guess at
 * what this kind of role usually does; a task the person who does it wrote down is evidence.
 */
export const roleTasks = pgTable('role_tasks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** Null for work that belongs to the business rather than to one role. */
  roleId: text('role_id').references(() => roles.id),
  name: text('name').notNull(),
  /** sequential | judgement | mixed — SPEC's tag, overridable by the person who does it. */
  kind: text('kind').notNull(),
  /** Hours a week across everyone who does it. Null means nobody has said, and nothing is estimated. */
  hoursPerWeek: real('hours_per_week'),
  /** Connected-system categories it touches, comma separated. */
  systems: text('systems').notNull().default(''),
  /** The KPI it feeds, when it feeds one. */
  criterionId: text('criterion_id').references(() => criteria.id),
  /**
   * Safety- or compliance-critical, and therefore never fully automated.
   *
   * The engine brief allows exactly one outcome for these: streamline, with a named person signing
   * off. It overrides every other signal, including a perfectly sequential description with every
   * system connected.
   */
  critical: boolean('critical').notNull().default(false),
  /** How much it hurts, raised by the intake box. Higher is worse. */
  pain: integer('pain').notNull().default(0),
  source: text('source').notNull().default('template'), // template | person | intake
  /**
   * proposed | approved | parked | rejected.
   *
   * `approved` IS the build queue — there is no second table, because a queue that can disagree with
   * the list it came from is a queue that will. `rejected` rows are kept so the engine does not
   * resurface something somebody has already said no to, which is how software teaches people to
   * stop reading it.
   */
  state: text('state').notNull().default('proposed'),
  /** Why it was rejected. One line, required, so a no can be revisited rather than re-argued. */
  rejectedReason: text('rejected_reason'),
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('role_tasks_tenant').on(t.tenantId), index('role_tasks_role').on(t.roleId)]).enableRLS();

/**
 * The intake box — anybody writes in a want or a gap.
 *
 * "I spend Friday afternoons chasing timesheets." "Quotes take four days." "I want the board pack to
 * build itself."
 *
 * This is how wants and problems go in one end and a build comes out the other, and it is the only
 * part of the engine that is open to everybody rather than to the top of the chart. That asymmetry
 * is deliberate: the person doing the drudge knows where it is, and the person who could authorise
 * removing it usually does not.
 *
 * An entry either raises the pain on a task that already exists, or becomes a new one. Either way
 * the words are kept exactly as written — they are evidence, and rewriting somebody's complaint into
 * tidier language is how the reason it mattered gets lost.
 */
export const intakeEntries = pgTable('intake_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** Who said it. Kept so somebody can be thanked, or asked what they meant. */
  byName: text('by_name').notNull(),
  /** Their words, unedited. */
  text: text('text').notNull(),
  /** The task it was matched to, or the task it created. Null while nothing has been matched. */
  taskId: text('task_id').references(() => roleTasks.id),
  createdAt: text('created_at').notNull(),
}, t => [index('intake_tenant').on(t.tenantId)]).enableRLS();

/**
 * Boards — the live artifacts a team pins, builds on and argues about.
 *
 * Kris, 16 September: *"no build these boards (artifacts) now - this is a key component of running
 * the business properly"*, from design export 3.
 *
 * ── What makes this different from everything else in SPEC ───────────────────────────────────────
 *
 * Every other screen is SPEC's own reading of the business: a scorecard, a register, a board pack.
 * A board is the business's own artifact — the thing a team makes together and comes back to. The
 * design's line for it is the whole brief: *"Live boards your team pins, builds on and discusses —
 * wired to the data connected through SPEC. Not a snapshot; it updates as the numbers move."*
 *
 * The worked example says it best. A Rate Board pulling base cost and on-costs from the systems the
 * business already runs, and landing on a sell rate of $105 instead of $115 — where the argument is
 * had against actuals rather than against somebody's memory of what the rate used to be.
 *
 * ── Rows and steps live as JSON, on purpose ──────────────────────────────────────────────────────
 *
 * A board's body is a handful of lines that only that board cares about: the inputs of a rate
 * calculation, the steps of a plan. Two more tables would buy nothing — nothing else joins to them,
 * nothing else queries across them — and would cost two more sets of row-level security policies and
 * two more things for a delete to remember. Same shape as `register_entries.bloom`.
 */
export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  /** live | plans | kpi | improve | training | meetings — see BOARD_TYPES in lib/boards-live. */
  kind: text('kind').notNull().default('improve'),
  /**
   * Wired to systems that are actually connected, rather than to numbers somebody typed once.
   *
   * It is a fact about the board, not a decoration: the design badges it, because "this updates as
   * the numbers move" and "this was true in August" are different things to be looking at.
   */
  live: boolean('live').notNull().default(false),
  /** The named feeds behind it, as JSON `[{ system, what }]`. Empty for a board with no data in it. */
  feeds: text('feeds').notNull().default('[]'),
  /** A live-data board's working, as JSON `[{ label, source, value }]`. */
  rows: text('rows').notNull().default('[]'),
  /** A plan's steps, as JSON `[{ text, owner, state }]`. */
  steps: text('steps').notNull().default('[]'),
  /** The headline pair a rate-style board turns on, as JSON `{ wasLabel, was, nowLabel, now, note }`. */
  headline: text('headline'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [index('boards_tenant').on(t.tenantId)]).enableRLS();

/**
 * The discussion on a board.
 *
 * Kept against the board rather than against a person's inbox: the argument about the sell rate
 * belongs next to the sell rate, where the next person to ask the question will find it, and not in
 * a thread three people were on.
 */
export const boardComments = pgTable('board_comments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  boardId: text('board_id').notNull().references(() => boards.id),
  authorName: text('author_name').notNull(),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('board_comments_board').on(t.boardId),
  // Scoped by business as well as by board: every tenant table is indexed on tenant_id, because a
  // read that has to scan every business is a read that gets slower with every customer SPEC signs.
  index('board_comments_tenant').on(t.tenantId),
]).enableRLS();

/**
 * Who has this board open — the design's "Editing now".
 *
 * A timestamp per person per board, refreshed when they open it, and read back within a few
 * minutes. Deliberately not presence over a socket: this is a page somebody reads for a minute, and
 * the question it answers is "is anybody else in here" rather than "where is their cursor".
 *
 * It is also the honest version. A fabricated row of avatars would look exactly like this one and
 * mean nothing, and a board is a place where two people are about to disagree about a number.
 */
export const boardViewers = pgTable('board_viewers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  boardId: text('board_id').notNull().references(() => boards.id),
  userId: text('user_id').notNull().references(() => users.id),
  seenAt: text('seen_at').notNull(),
}, t => [
  uniqueIndex('board_viewers_unique').on(t.boardId, t.userId),
  index('board_viewers_tenant').on(t.tenantId),
]).enableRLS();

/**
 * ── Safety ───────────────────────────────────────────────────────────────────────────────────────
 *
 * SPEC is the safety system (design 3f, 23 September): no third-party safety product sits behind
 * these. Four tables, each carrying its own tenant_id so each can be isolated without a join, and
 * each read and written only through `/safety`. The decisions — notifiable, overdue, clear to work,
 * who may see what — live in lib/safety, not here.
 */

/**
 * One line from somebody on site: a hazard, a near miss, an injury, or "not coping".
 *
 * Hazards, near misses and injuries share a table because they are one register read four ways —
 * the incident register is the injuries, the hazard list is the hazards and near misses, and a near
 * miss that turns out to be a dangerous incident is the same row, not a copy.
 *
 * ── Anonymous means nothing kept ────────────────────────────────────────────────────────────────
 *
 * A wellbeing report sent anonymously stores NO reporter, NO role, NO job and only the DATE it was
 * sent. Not hidden from the screen — absent from the row. An anonymous report that the database can
 * de-anonymise is a named report with worse manners, and nobody would use it twice.
 */
export const safetyReports = pgTable('safety_reports', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** hazard | near_miss | injury | wellbeing — see REPORT_KINDS in lib/safety. */
  kind: text('kind').notNull(),
  /** What the person typed, in their own words. Never rewritten. */
  text: text('text').notNull(),
  /** The job or site it happened on, as the business names its jobs. Null when unknown or anonymous. */
  jobRef: text('job_ref'),
  /** The state or territory the site is in (NSW, VIC, NZ…), for the regulator. Null until known. */
  state: text('state'),
  /** Injuries only: first_aid | medical | lost_time | serious. Null until somebody assesses it. */
  severity: text('severity'),
  /** SPEC's prompt at the moment of sending — "this looks notifiable" — not a ruling. */
  notifiable: boolean('notifiable').notNull().default(false),
  /** When somebody recorded that the regulator was told. */
  regulatorToldAt: text('regulator_told_at'),
  /** Null when anonymous. Never backfilled. */
  reportedBy: text('reported_by').references(() => users.id),
  /** The reporter's role when they sent it, so the report follows the chart. Null when anonymous. */
  roleId: text('role_id').references(() => roles.id),
  anonymous: boolean('anonymous').notNull().default(false),
  /** Who has it, in the business's words. Proposed from the chart; a leader can change it. */
  owner: text('owner'),
  /** Fix-by date, YYYY-MM-DD. */
  dueAt: text('due_at'),
  /** open | closed */
  status: text('status').notNull().default('open'),
  closedAt: text('closed_at'),
  /** For an anonymous report, the date only. */
  createdAt: text('created_at').notNull(),
}, t => [index('safety_reports_tenant').on(t.tenantId, t.kind)]).enableRLS();

/** What will stop it happening again, who owns it, and by when. */
export const safetyActions = pgTable('safety_actions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** The report it came from, if it came from one. An inspection finding may not have. */
  reportId: text('report_id').references(() => safetyReports.id),
  text: text('text').notNull(),
  owner: text('owner'),
  dueAt: text('due_at'),
  doneAt: text('done_at'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
}, t => [index('safety_actions_tenant').on(t.tenantId)]).enableRLS();

/**
 * The on-site record: toolbox talks, SWMS/JSA sign-off, site inspections, vehicle and plant checks.
 *
 * One table for four because they are the same shape — something on a date, at a place, done by
 * somebody, with either a count of who signed or a pass or fail — and a fifth kind should be a word
 * in lib/safety rather than a migration.
 */
export const safetyChecks = pgTable('safety_checks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** toolbox | swms | inspection | vehicle */
  kind: text('kind').notNull(),
  /** "Working at heights", "Ute 14 — weekly check". */
  title: text('title').notNull(),
  /** The job, site, vehicle or piece of plant, in the business's words. */
  place: text('place'),
  /** Who ran it, drove it, or signs for it. */
  person: text('person'),
  /** When it was done, or when it is due if not done yet. YYYY-MM-DD. */
  onDate: text('on_date'),
  /** due | done | passed | failed */
  result: text('result').notNull().default('due'),
  /** Toolbox and SWMS: how many have signed, of how many who should. */
  signed: integer('signed'),
  expected: integer('expected'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
}, t => [index('safety_checks_tenant').on(t.tenantId, t.kind)]).enableRLS();

/**
 * Workers' compensation and return to work.
 *
 * The claim itself lives with the insurer. What SPEC holds is the part the business runs: who owns
 * the case, when the insurer was told, and where suitable duties are up to, week by week.
 */
export const safetyClaims = pgTable('safety_claims', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** The injury it follows from. */
  reportId: text('report_id').references(() => safetyReports.id),
  worker: text('worker').notNull(),
  caseOwner: text('case_owner'),
  lodgedAt: text('lodged_at'),
  insurerToldAt: text('insurer_told_at'),
  /** Suitable duties: this week, of how many planned. */
  dutiesWeek: integer('duties_week'),
  dutiesWeeks: integer('duties_weeks'),
  /** open | closed */
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
}, t => [index('safety_claims_tenant').on(t.tenantId)]).enableRLS();
/* ══ Jobs ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * SPEC running the work itself, enquiry to paid (design: SPEC Jobs, 23 September). Eight tables, kept
 * together at the end of this file so they read as one piece. Every one carries its own tenant_id and
 * is under the tenant policy in drizzle/0001_rls.sql — none reaches its business through a join.
 *
 * Generic on purpose (DECISIONS, 11 September): the shape of a trade business, never one client's
 * suppliers, rates or award. A supplier is whatever the business types; SPEC names none.
 *
 * Money is integer cents throughout. The arithmetic lives in lib/jobs and is tested there.
 */

/** One piece of work, from the first phone call to the money in the bank. */
export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** J-1001 — what the crew and the client call it. */
  ref: text('ref').notNull(),
  /** enquiry | quoted | won | scheduled | onsite | invoiced | paid — see STAGES in lib/jobs. */
  stage: text('stage').notNull().default('enquiry'),
  title: text('title').notNull(),
  client: text('client').notNull(),
  /**
   * The client on the client list (23 September) — a CRM organisation, and/or the person the work is
   * for. `client` stays the words the job was logged with and is never rewritten; these link it.
   * Null on a job logged before the client list existed until it is linked by name (/clients).
   */
  organisationId: text('organisation_id'),
  personId: text('person_id'),
  site: text('site').notNull().default(''),
  /** The price agreed, ex GST. Set from the quote when it goes out; zero until then. */
  valueCents: integer('value_cents').notNull().default(0),
  /**
   * Materials put on the job so far. Null means nobody has recorded any — not zero, because a job
   * with no materials recorded has not got a flattering margin, it has an unmeasured one.
   */
  materialsCents: integer('materials_cents'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  /** When it entered the stage it is in. */
  stageAt: text('stage_at').notNull(),
}, t => [
  index('jobs_tenant').on(t.tenantId),
  uniqueIndex('jobs_tenant_ref').on(t.tenantId, t.ref),
  index('jobs_organisation').on(t.tenantId, t.organisationId),
]).enableRLS();

/**
 * A price for a job. The lines are snapshots — see quote_lines — so a quote that has gone out keeps
 * the price it went out at, whatever the catalogue does next.
 */
export const quotes = pgTable('quotes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  ref: text('ref').notNull(),
  /** 25 | 35 | 45 — see MARKUPS in lib/jobs. */
  markupPct: integer('markup_pct').notNull().default(35),
  /** draft | sent. SPEC never emails a quote; "sent" is the business saying it went out. */
  status: text('status').notNull().default('draft'),
  sentAt: text('sent_at'),
  sentBy: text('sent_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('quotes_tenant').on(t.tenantId),
  index('quotes_job').on(t.jobId),
]).enableRLS();

/** One line of a quote, carrying its own prices. See QuoteLine in lib/jobs. */
export const quoteLines = pgTable('quote_lines', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  quoteId: text('quote_id').notNull().references(() => quotes.id),
  position: integer('position').notNull().default(0),
  /** item | kit | labour */
  kind: text('kind').notNull(),
  /** The catalogue item, kit or labour rate it was built from. Kept for reference, never re-read to price. */
  refId: text('ref_id').notNull(),
  name: text('name').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  hours: real('hours').notNull().default(0),
  rateCostCents: integer('rate_cost_cents').notNull().default(0),
  rateChargeCents: integer('rate_charge_cents').notNull().default(0),
  qty: real('qty').notNull().default(1),
}, t => [
  index('quote_lines_tenant').on(t.tenantId),
  index('quote_lines_quote').on(t.quoteId),
]).enableRLS();

/** The items a business actually uses, at its supplier's price. */
export const catalogueItems = pgTable('catalogue_items', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  /** Whoever the business buys it from, as the business writes it. */
  supplier: text('supplier').notNull().default(''),
  unit: text('unit').notNull().default('each'),
  costCents: integer('cost_cents').notNull(),
  /** The date of the price — from the supplier's file, or the day it was typed. */
  priceDate: text('price_date'),
  /** Last put on a quote. Twelve months without is when SPEC suggests retiring it. */
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('catalogue_items_tenant').on(t.tenantId)]).enableRLS();

/** What an hour costs the business, and what it charges. */
export const labourRates = pgTable('labour_rates', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  costCents: integer('cost_cents').notNull(),
  chargeCents: integer('charge_cents').notNull(),
  /** The first rate is the standard one — what a kit's hours and a job's labour are costed at. */
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [index('labour_rates_tenant').on(t.tenantId)]).enableRLS();

/**
 * A bundle quoted in one line — "switchboard upgrade", "downlight, supply and install".
 *
 * Its parts are JSON `[{ itemId, qty }]`, the same judgement as `boards.rows`: nothing else joins to
 * them or queries across them, and another table would buy a second policy and nothing else.
 */
export const kits = pgTable('kits', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  components: text('components').notNull().default('[]'),
  labourHours: real('labour_hours').notNull().default(0),
  labourRateId: text('labour_rate_id'),
  extraCostCents: integer('extra_cost_cents').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [index('kits_tenant').on(t.tenantId)]).enableRLS();

/**
 * Who is on which job, which day.
 *
 * A person is `staff:<id>` or `user:<id>` — the same two kinds of person the People screen holds.
 * One job per person per day, enforced by the database rather than by remembering.
 */
export const scheduleBookings = pgTable('schedule_bookings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  personKey: text('person_key').notNull(),
  personName: text('person_name').notNull(),
  /** ISO date. */
  day: text('day').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('schedule_bookings_tenant').on(t.tenantId),
  uniqueIndex('schedule_bookings_person_day').on(t.tenantId, t.personKey, t.day),
]).enableRLS();

/**
 * A stretch of work: Start to Finish, on a job or not.
 *
 * Normally written by Start and Finish on the phone; typed in by a leader is a complete mode too.
 * Time on a job is billable; yard, travel between and training are not.
 */
export const timesheetEntries = pgTable('timesheet_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  personKey: text('person_key').notNull(),
  personName: text('person_name').notNull(),
  /** Null for time not on a client's job. */
  jobId: text('job_id'),
  day: text('day').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  minutes: integer('minutes').notNull().default(0),
  billable: boolean('billable').notNull().default(true),
  /** phone | typed */
  source: text('source').notNull().default('phone'),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('timesheet_entries_tenant').on(t.tenantId),
  index('timesheet_entries_day').on(t.tenantId, t.day),
]).enableRLS();

/* ══ CRM ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Sales work before a job exists (23 September): a pipeline of deals by stage, the organisations and
 * people they are with, the activities that move them, and each deal's history. A won deal becomes a
 * job in the Jobs pipeline above and keeps its id. Six tables, kept together as one block.
 *
 * Every one carries its own tenant_id, indexed, and is under the tenant policy in
 * drizzle/0001_rls.sql. No foreign keys — the same shape production has (see CLAUDE.md, "Your
 * database is not the one that ships"); every id that arrives from a form is re-read with the
 * business's tenant_id before anything is changed.
 *
 * Money is integer cents. The forecast — open value, weighted value, won this month, win rate — is
 * computed from these rows on every read (lib/crm) and never stored.
 */

/**
 * A column on the board. SPEC proposes a trade business's five (lib/crm DEFAULT_STAGES); the business
 * renames them, sets what each is worth to the forecast, and how long a deal may sit before it is
 * flagged as going quiet.
 */
export const crmStages = pgTable('crm_stages', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  /** Whole percent, 0–100. */
  probability: integer('probability').notNull().default(0),
  /** Days without anything happening before a deal here is flagged. */
  rotDays: integer('rot_days').notNull().default(7),
  createdAt: text('created_at').notNull(),
}, t => [index('crm_stages_tenant').on(t.tenantId)]).enableRLS();

/** A business the business sells to. */
export const crmOrganisations = pgTable('crm_organisations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('crm_organisations_tenant').on(t.tenantId)]).enableRLS();

/** A person the business deals with. Belongs to an organisation, or to nobody (a homeowner). */
export const crmPeople = pgTable('crm_people', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  organisationId: text('organisation_id'),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('crm_people_tenant').on(t.tenantId),
  index('crm_people_org').on(t.tenantId, t.organisationId),
]).enableRLS();

/**
 * One piece of work being sold.
 *
 * Owned by a ROLE on the org chart, with the holder's name kept beside it as it was when given —
 * role first, person second, and it is the role that decides who may see it: the owner and everybody
 * above them in their own line, never sideways.
 */
export const crmDeals = pgTable('crm_deals', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  organisationId: text('organisation_id'),
  personId: text('person_id'),
  /** Where the work is, if known. Carried onto the job when the deal is won. */
  site: text('site').notNull().default(''),
  /** What the work is worth, ex GST. */
  valueCents: integer('value_cents').notNull().default(0),
  stageId: text('stage_id').notNull(),
  /** open | won | lost */
  status: text('status').notNull().default('open'),
  ownerRoleId: text('owner_role_id'),
  ownerName: text('owner_name').notNull().default(''),
  /** ISO date. */
  expectedClose: text('expected_close'),
  notes: text('notes').notNull().default(''),
  /** One of LOST_REASONS in lib/crm, and the words when it was "Other". */
  lostReason: text('lost_reason'),
  lostNote: text('lost_note'),
  closedAt: text('closed_at'),
  closedBy: text('closed_by'),
  /** The job a won deal became, in the Jobs pipeline. */
  jobId: text('job_id'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  /** When it entered the stage it is in. */
  stageAt: text('stage_at').notNull(),
}, t => [
  index('crm_deals_tenant').on(t.tenantId),
  index('crm_deals_owner').on(t.tenantId, t.ownerRoleId),
]).enableRLS();

/**
 * Something to do on a deal, by a day: a call, a meeting, a site visit, an email to send yourself,
 * a task. SPEC sends nothing — an email here is a reminder, not a message.
 */
export const crmActivities = pgTable('crm_activities', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  dealId: text('deal_id').notNull(),
  /** call | meeting | site_visit | email | task */
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  /** ISO date. */
  dueDate: text('due_date').notNull(),
  ownerRoleId: text('owner_role_id'),
  ownerName: text('owner_name').notNull().default(''),
  doneAt: text('done_at'),
  doneBy: text('done_by'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('crm_activities_tenant').on(t.tenantId),
  index('crm_activities_deal').on(t.tenantId, t.dealId),
]).enableRLS();

/**
 * A deal's history — created, moved, won, lost, reopened, a note, an activity ticked off. Appended,
 * never edited: what happened to a deal stays what happened.
 */
export const crmDealEvents = pgTable('crm_deal_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  dealId: text('deal_id').notNull(),
  /** created | stage | won | lost | reopened | note | done | owner */
  kind: text('kind').notNull(),
  fromStageId: text('from_stage_id'),
  toStageId: text('to_stage_id'),
  text: text('text').notNull().default(''),
  byName: text('by_name').notNull(),
  at: text('at').notNull(),
}, t => [
  index('crm_deal_events_tenant').on(t.tenantId),
  index('crm_deal_events_deal').on(t.tenantId, t.dealId),
]).enableRLS();

/**
 * Who runs each capability on the Coverage map: SPEC, or the business's own system.
 *
 * One row per capability somebody CHANGED from the default. No row is SPEC — the default is never
 * written, so switching back to SPEC deletes the row. `capability` is a key from `lib/coverage`'s
 * CAPABILITIES; `choice` is 'spec' | 'own' (only 'own' is ever stored today, and 'spec' is still
 * read correctly if it ever is). Changed by a manager, the same gate as Jobs and Safety.
 */
export const coverageChoices = pgTable('coverage_choices', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  capability: text('capability').notNull(),
  choice: text('choice').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  uniqueIndex('coverage_choices_tenant_capability').on(t.tenantId, t.capability),
]).enableRLS();

/**
 * Compliance items — insurance, certificates, audits and contracts.
 *
 * ── Four areas, not six ──────────────────────────────────────────────────────────────────────────
 *
 * The Compliance screen shows six areas and this table holds four of them. The other two are things
 * SPEC already knows: **licences and tickets** are `obligations`, the same rows that gate Clear to
 * Work on People, and **breaches and corrective actions** are the actions already raised against
 * safety reports. Both are read there rather than copied here.
 *
 * That is the same rule the safety register was built on. One copy of an answer, because the day
 * two copies disagree nobody believes either — and a licence that says "current" on People and
 * "lapsed" on Compliance is worse than having neither page.
 *
 * One table with a `kind` rather than four, for the reason the safety register is one table: these
 * differ in what they are ABOUT and not in what happens to them. Every one of them is a thing with
 * a date that has to be renewed, chased or lodged, and every one of them stops some work when it
 * lapses. A schema that splits them makes four screens out of one question.
 */
export const complianceItems = pgTable('compliance_items', {
  id: text('id').primaryKey(),
  /*
    No foreign key, like every table added since the CRM block. The additive migrator only ever
    emits `create table if not exists` and `add column if not exists`, and a constraint it cannot
    add later is a constraint that silently is not there — so the scoping is enforced in every
    query and by row-level security, which are the two places that actually run.
  */
  tenantId: text('tenant_id').notNull(),
  /** insurance | certificates | audits | contracts — see AREAS in lib/compliance. */
  kind: text('kind').notNull(),
  /** What it is, in the business's own words: "JBI public liability, $20m". */
  title: text('title').notNull(),
  /** Who or what it covers — a person, a subcontractor, a vehicle, a job. Free text on purpose. */
  covers: text('covers'),
  /**
   * When it lapses. Null means nobody has recorded one, which `stateOf` reads as `missing` rather
   * than as fine: a policy with no expiry is not a policy anybody can say is in force.
   */
  expiresAt: text('expires_at'),
  /**
   * Set when a one-off is DONE rather than renewed — a certificate lodged, an audit passed.
   *
   * A certificate does not expire, it gets lodged; an audit does not lapse, it happens. Without
   * this they would sit on the register forever reading as missing, which is how a page full of
   * red teaches people to stop looking at it.
   */
  satisfiedAt: text('satisfied_at'),
  /** Where the evidence is — a reference, a policy number, a lodgement number. */
  reference: text('reference'),
  /** Whose job it is to renew or lodge it. A role, because people leave and the duty does not. */
  ownerRoleId: text('owner_role_id'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('compliance_items_tenant').on(t.tenantId),
  index('compliance_items_kind').on(t.tenantId, t.kind),
]).enableRLS();

/**
 * Materials ordered from a supplier, and the bill that answers it.
 *
 * The Stock & buying tab carried a heading called Purchase orders with nothing behind it. What a
 * trade business actually loses money on is not raising the order — it is the bill that arrives
 * three weeks later for more than the order said, gets paid because nobody had the order in front
 * of them, and takes the margin off a job quoted at the old price. So the bill total lives on the
 * same row as the order total: the comparison is the point, and a comparison that needs a join is
 * a comparison somebody skips. See `match` in lib/purchasing.
 */
export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** PO-0001. Shaped like a job reference so a pile of paperwork sorts itself. */
  ref: text('ref').notNull(),
  supplier: text('supplier').notNull(),
  /** The job it is for, when it is for one. Free text rather than a key — see the CRM tables. */
  jobId: text('job_id'),
  /** draft | sent | received | billed | closed — see ORDER_STATES in lib/purchasing. */
  state: text('state').notNull().default('draft'),
  /** What was ordered, in the business's own words. One line is enough to check a bill against. */
  what: text('what'),
  totalCents: integer('total_cents').notNull().default(0),
  expectedAt: text('expected_at'),
  /** The supplier's own invoice number, and what they billed. Null until the bill arrives. */
  billRef: text('bill_ref'),
  billTotalCents: integer('bill_total_cents'),
  /** Set when somebody has looked at a difference and accepted it. */
  matchedAt: text('matched_at'),
  matchedBy: text('matched_by'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('purchase_orders_tenant').on(t.tenantId),
  uniqueIndex('purchase_orders_ref').on(t.tenantId, t.ref),
]).enableRLS();

/**
 * Records held against a person — an employment contract, and a conduct process.
 *
 * ── One table, because they are the same shape ───────────────────────────────────────────────────
 *
 * Both are a document about one person that moves through states and must not be edited after the
 * fact. A contract is drafted, sent, and accepted. A conduct process is raised, and walks the five
 * steps of procedural fairness. The columns that matter — who, what state, which step, what was
 * said, when — are the same, and splitting them would make two screens out of one question about a
 * person's file.
 *
 * `personName` is free text rather than a key, for the same reason the workers' compensation
 * tracker uses one: the person may be an apprentice or a subcontractor with no SPEC login, and a
 * file that can only hold seated people quietly drops the ones it is most needed for.
 */
export const peopleRecords = pgTable('people_records', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** contract | conduct — see RECORD_KINDS in lib/hr-records. */
  kind: text('kind').notNull(),
  personName: text('person_name').notNull(),
  /** The role it was drafted from, when there is one. */
  roleId: text('role_id'),
  /** The contract's text, or what the concern is. SPEC drafts; the leader edits; nothing invents pay. */
  body: text('body').notNull().default(''),
  /** draft | sent | signed | declined for a contract; open | closed for a conduct process. */
  state: text('state').notNull().default('draft'),
  /**
   * How many of the five fair-process steps are done. A step may only ever be the next one — see
   * `mayTake` in lib/hr. A skipped step is a process a tribunal can unpick.
   */
  stepsDone: integer('steps_done').notNull().default(0),
  /** What was said at each step, as JSON `[{ step, note, at }]`. Append-only in practice. */
  steps: text('steps').notNull().default('[]'),
  sentAt: text('sent_at'),
  /**
   * When the person accepted it, and from where.
   *
   * A recorded acceptance with a timestamp is what a small business actually needs and is what
   * SPEC can honestly provide. It is deliberately NOT dressed up as a digital signature: claiming
   * more evidentiary weight than a click carries would be worse than claiming none.
   */
  signedAt: text('signed_at'),
  signedBy: text('signed_by'),
  /** The date somebody checks it has been put right — the step businesses skip. */
  reviewAt: text('review_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('people_records_tenant').on(t.tenantId),
  index('people_records_kind').on(t.tenantId, t.kind),
]).enableRLS();

/**
 * A pay run, and the award check that ran before it went out.
 *
 * The design: *"every pay run checked against the award before it goes."* Before, not after — a
 * check that runs afterwards finds underpayments that have already been made, which is a different
 * and more expensive problem.
 *
 * The hours are the ones SPEC already holds from the phone, so a pay run is not somebody typing
 * numbers a second time. `issues` is what the check found, kept as written rather than recomputed,
 * because "what did we know when we paid it" is the question that gets asked later.
 */
export const payRuns = pgTable('pay_runs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** The week worked, Monday to Sunday. Always a week already finished. */
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  /** Whose hours, and how many, as JSON `[{ who, minutes, jobs }]` — the export's own rows. */
  rows: text('rows').notNull().default('[]'),
  /** What the award check found, as JSON `[{ check, who, says }]`. Empty means nobody under award. */
  issues: text('issues').notNull().default('[]'),
  checkedAt: text('checked_at'),
  checkedBy: text('checked_by'),
  /** Set when the rows went to the accounting system. Never set while an issue is open. */
  exportedAt: text('exported_at'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('pay_runs_tenant').on(t.tenantId),
  uniqueIndex('pay_runs_week').on(t.tenantId, t.fromDate),
]).enableRLS();
