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
   * Where a paid customer is sent to leave a review, and the floor under this business's cash.
   *
   * `reviewLink` is the business's own review link. There is ONE, used for everybody — see the rule
   * at the top of lib/reviews: no gating, ever.
   *
   * `cashBufferCents` is the level below which this business starts making bad decisions — paying
   * late, discounting to get a deposit in. SPEC cannot know that number, so it belongs to the
   * business, and the default in lib/cashflow is a starting point rather than an opinion.
   */
  reviewLink: text('review_link'),
  /*
    ── What the certificate is called here, and how long there is to lodge it ────────────────────

    The business's own answers, because every state runs its own scheme under its own name inside
    its own window and they change. `certificateWithinDays` is null until somebody sets it, and null
    is a REAL state: SPEC then tracks the certificate as outstanding and refuses to say whether it
    is late. A deadline SPEC invented would be worse than no deadline — a business lodging to a
    made-up window has been actively misled by the thing it trusted to keep it right.
  */
  certificateName: text('certificate_name'),
  certificateTerritory: text('certificate_territory'),
  certificateWithinDays: integer('certificate_within_days'),
  /**
   * When the weekly COGS meeting sits — 1 (Monday) to 7 (Sunday), and "07:30" in the business's own
   * time. Null until somebody says, and asked once on /meeting. The Make it simple report is ready
   * the day before it (lib/make-it-simple); with no day set it runs weekly from Monday.
   */
  meetingDay: integer('meeting_day'),
  meetingTime: text('meeting_time'),
  /**
   * What one no-access costs this business in hours — travel there, travel on, and the hole in the
   * run that nothing fills at two hours' notice. Null until somebody says, and SPEC never guesses:
   * a made-up cost is a business making decisions on arithmetic somebody else did in their head.
   */
  noAccessHours: text('no_access_hours'),
  cashBufferCents: integer('cash_buffer_cents'),
  /*
    ── The financial system underneath, and what the shields are measured against ────────────────

    `financeSource` is 'angus' or 'connector', and it is a SETTING rather than an integration.
    Angus Shield is SPEC's own financial system on this same database, so turning it on changes
    where figures are read from and nothing else — see the rule at the top of lib/angus: no
    connector code may ever be reused as the Angus Shield path.

    `angusAnswer` is 'switch' or 'stay'. 'stay' is a real answer that stops SPEC asking, which is
    what "never forced" has to mean if it means anything.

    The three shield settings belong to the business and SPEC will not invent any of them. Weeks of
    cover needs the weekly running cost; a margin means nothing without a benchmark to hold it to.
    Null in any of them means the shield reports the figure and says it has nothing to judge it by —
    the honest answer, and the one lib/certificates set the precedent for.
  */
  financeSource: text('finance_source').notNull().default('connector'),
  angusAnswer: text('angus_answer'),
  angusAnsweredAt: text('angus_answered_at'),
  bufferWeeks: real('buffer_weeks'),
  weeklyCostCents: integer('weekly_cost_cents'),
  benchmarkMarginPct: real('benchmark_margin_pct'),
  taxSetAsideCents: integer('tax_set_aside_cents'),
  /*
    ── The owner is away ─────────────────────────────────────────────────────────────────────────

    While `awayUntil` is set, every alert and lever goes to the deputy. One thing still reaches the
    owner and it is somebody getting hurt — ONLY_INJURY_REACHES_YOU in lib/gm-home. Away with no
    deputy named is a real and visible state: the alerts keep coming to the owner and the screen
    says so, because a switch that silently does nothing is worse than a switch that is off.
  */
  awayUntil: text('away_until'),
  deputyKey: text('deputy_key'),
  deputyName: text('deputy_name'),
  /**
   * Whether this business lets SPEC use its data, anonymised, for industry benchmarks.
   *
   * Default OFF, and it stays off until somebody deliberately turns it on. The business owns its
   * data either way; names, customers and prices are never shared at all.
   */
  benchmarksOptIn: boolean('benchmarks_opt_in').notNull().default(false),
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
  /*
    ── Set before anybody is invited, so the bill is decided before it is charged ────────────────

    Kris, 24 September, setting JBI up with his HR admin: put everybody in, tick what each one is,
    and *"finalise payment after everything is set"*.

    Billing reads `users.seatKindOverride`, which only exists once a person has an account. A
    business filling its list in on a Monday morning has no accounts yet — so the intent is recorded
    HERE, on the person, and carried onto their account when they are invited. Without that, the
    business would have to invite everybody (and start paying) before it could say who was what.
  */
  /** leadership | team | null — null means take it from the chart, the way it always did. */
  seatKind: text('seat_kind'),
  /**
   * A subcontractor, ticked on the same list as everybody else.
   *
   * Kris's correction of 24 September is what makes this a tick rather than a separate register:
   * subbies are people working for the business, held to the full expectation, on a paid team seat.
   * The only thing that differs is what they can see. A separate list would say the opposite.
   */
  isSubcontractor: boolean('is_subcontractor').notNull().default(false),
  /** When their induction was done. Null until it is — and not bookable until then. */
  inductedAt: text('inducted_at'),
  /**
   * When the PERSON said they had read the induction, which is not the same thing.
   *
   * Two fields on purpose. `inductedAt` is the business's mark and is what Clear to Work reads;
   * this is the person's own acknowledgement, made from their phone with nothing but a link. If
   * one field served both, anybody holding a forwarded text message could grant themselves the
   * check that stops an uninducted body walking onto a site.
   *
   * It is still worth recording: it tells the office who has actually read the thing, so the
   * induction itself becomes a conversation rather than a signature hunt.
   */
  inductionReadAt: text('induction_read_at'),
  /**
   * The link this person opens on their phone to finish their own record.
   *
   * Thirty-eight people with a licence, a ticket, an induction and a start date is well over a
   * hundred fields. An HR admin typing them from a pile of photocopies is a day's work producing a
   * register nobody trusts, because the certificate is in a drawer and the row is a transcription.
   * The office puts in what only the office knows; the person puts in what only they have.
   *
   * A credential, like the customer page's: 32 random characters, one per person, never printed
   * anywhere else, and clearable once they are set up.
   */
  setupToken: text('setup_token'),
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
  /**
   * When this customer was asked for a review. Null means nobody has been asked yet.
   *
   * On the JOB rather than the customer, because the ask is per job — the same customer coming back
   * next year is asked again, and somebody who had a bad first job and a good second one gets both
   * chances. It is also what stops anybody being asked twice for the same work.
   */
  reviewAskedAt: text('review_asked_at'),
  /**
   * The customer's own link for this job, and what it shows.
   *
   * `customerToken` is 32 random hex characters — the link IS the key, because a customer will not
   * make an account to find out when the electrician is arriving. It is treated as a credential:
   * never printed in a page SPEC renders to anybody else, and clearable when the job is finished.
   *
   * The rest is what the customer is told: the slot they picked, whether somebody is on the way and
   * how far off, and which vehicle to look for. See lib/customer-page for what may never appear.
   */
  customerToken: text('customer_token'),
  bookedSlot: text('booked_slot'),
  onWayAt: text('on_way_at'),
  etaMinutes: integer('eta_minutes'),
  vehicle: text('vehicle'),
  /**
   * Where the work came from — the website form, a Google search, a missed call, a repeat customer,
   * a builder, a referral.
   *
   * ── Why this is a column and not a Leads table ───────────────────────────────────────────────
   *
   * A lead IS an enquiry, and an enquiry is already the first stage of the Jobs board. Building a
   * separate Leads register would mean the same piece of work living in two lists that drift, and
   * somebody having to move it from one to the other. Two columns on the job it already is gives
   * the whole Leads tab: where it came from, and how long it has been waiting.
   */
  source: text('source'),
  /**
   * Which sector this work came from — the business's own, from `sectors`.
   *
   * Null on every job until a business sets its sectors up, and null forever for a business that
   * only works in one. A single-sector business must never be made to tag anything.
   */
  sectorId: text('sector_id'),
  /**
   * maintenance | project | shutdown — see WORK_KINDS in lib/sectors.
   *
   * The one field that answers how much of next year is already there without anybody selling
   * anything, which is what Kris's "steadily" actually means.
   */
  workKind: text('work_kind'),
  /**
   * One person answerable for the whole job, however many crews are on it.
   *
   * Kris, 25 September: *"split scopes with one supervisor overall"*. Null on an ordinary
   * single-crew job, where the one person on it is already the answer and asking would be ceremony.
   * Required the moment a job has a second scope — see `needsSupervisor` in lib/crews.
   */
  supervisorKey: text('supervisor_key'),
  supervisorName: text('supervisor_name'),
  /*
    ── The one document that proves the work was lawful ──────────────────────────────────────────

    Held against the job, because that is the only place it is ever looked for: an insurance claim,
    a fire, a regulator, a builder's audit, or a sale of the business where four years of them have
    to be produced at once. Done on a pad in the ute, it is the one document the job does not have.

    Three fields rather than one flag, because written and LODGED are different states and the gap
    between them is where businesses fall: the customer has their copy, everybody believes it is
    done, and the body that had to receive it never did. See lib/certificates.
  */
  certificateRef: text('certificate_ref'),
  certificateIssuedAt: text('certificate_issued_at'),
  certificateLodgedAt: text('certificate_lodged_at'),
  /** Set when the business says this job does not need one, and why. Never a silent skip. */
  noCertificateBecause: text('no_certificate_because'),
  /** When the quote actually went out. What speed-to-quote is measured from `createdAt` against. */
  quotedAt: text('quoted_at'),
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
  /**
   * The job pack that turns a kit into a pre-build — the design's Good/Better/Best tiers.
   *
   * A kit prices the work. A PRE-BUILD also tells the crew how to do it: which SWMS applies, what
   * to check before leaving, and what to load on the van. Those three are the difference between a
   * line on a quote and a job that goes right the first time, and they are all lists of short
   * lines, so they are stored as lists rather than as three more tables.
   */
  swms: text('swms'),
  checklist: text('checklist').notNull().default('[]'),
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
  /**
   * The basics payroll needs from the job system, and nothing more (Kris, 25 September: SiteVIP's
   * payroll job is who worked, on which job, where and when). `minutes` is the paid time — start to
   * finish less the break. Travel to and from site is its own figure; allowances are tags from
   * ALLOWANCES in lib/timesheets, comma-separated. SiteVIP never works out a rate, tax or super.
   */
  breakMinutes: integer('break_minutes').notNull().default(0),
  travelMinutes: integer('travel_minutes').notNull().default(0),
  allowances: text('allowances').notNull().default(''),
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
  /** Set when the approved timesheet was sent on for processing. */
  exportedAt: text('exported_at'),
  /** Where it went: `export` (a file for the business's payroll system) or `angus_shield`. */
  sentTo: text('sent_to'),
  /*
    ── Design 19: the seven checks, and who may approve ──────────────────────────────────────────

    The award check above was the first of what are now seven, and Kris's rule is that a pay run
    cannot be approved until every one of them passes. `approvedAt` is therefore the one field in
    SPEC that a server action guards absolutely rather than gently: see readRun in lib/pay-run,
    where a check that never ran counts exactly as one that failed.

    Why this blocks when the rest of SPEC asks: an underpaid apprentice did not choose anything,
    will very often not know, and the error compounds every fortnight until somebody audits it.
    There is no version of that where "we asked and they clicked yes" is an answer.

    `cycle` and `payDate` exist because a business may run weekly, fortnightly or monthly. The
    fromDate/toDate above are unchanged, so a weekly business's rows read exactly as they did.
  */
  cycle: text('cycle').notNull().default('weekly'),
  payDate: text('pay_date'),
  approvedAt: text('approved_at'),
  /** The seat that may approve is the Head of Commercial; this records who actually did. */
  approvedBy: text('approved_by'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('pay_runs_tenant').on(t.tenantId),
  uniqueIndex('pay_runs_week').on(t.tenantId, t.fromDate),
]).enableRLS();

/**
 * Money against a job — a variation, a progress claim, or an invoice.
 *
 * ── One table, three capabilities ────────────────────────────────────────────────────────────────
 *
 * SimPro has a screen for variations, one for progress claims, one for retention and one for
 * invoicing. They are four views of one fact: a sum attached to this job that somebody owes or will
 * owe. What genuinely differs is when it is raised and what must happen before it can be sent, and
 * those are rules — they live in lib/billing-job, not in four sets of columns.
 */
export const jobBills = pgTable('job_bills', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  jobId: text('job_id').notNull(),
  /** variation | claim | invoice — see BILL_KINDS in lib/billing-job. */
  kind: text('kind').notNull(),
  what: text('what').notNull(),
  amountCents: integer('amount_cents').notNull().default(0),
  /**
   * Held back from a progress claim, and genuinely the business's money. Released later by somebody
   * remembering — which is exactly why it is a column rather than a sum in somebody's head.
   */
  retentionCents: integer('retention_cents').notNull().default(0),
  releasedAt: text('released_at'),
  /** draft | agreed | sent | paid | declined. A variation may not be sent until it is agreed. */
  state: text('state').notNull().default('draft'),
  /** Who agreed the extra work, on site, before it was done. The thing that stops a write-off. */
  agreedBy: text('agreed_by'),
  agreedAt: text('agreed_at'),
  sentAt: text('sent_at'),
  paidAt: text('paid_at'),
  /** How many of the 7, 14 and 30-day reminders have gone, so the same one never goes twice. */
  remindersSent: integer('reminders_sent').notNull().default(0),
  lastReminderAt: text('last_reminder_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('job_bills_tenant').on(t.tenantId),
  index('job_bills_job').on(t.tenantId, t.jobId),
]).enableRLS();

/**
 * Something that comes round again — a service contract, or a tested item.
 *
 * ── One table, because "next due" is the whole feature ───────────────────────────────────────────
 *
 * A maintenance agreement and a tagged appliance look like different things and behave like one:
 * each has an interval, a last-done date, and a next-due date that nobody works out until it is
 * late. The design asks for contracts "that book themselves" and for every tested item "with
 * result, photo and next due date" — both are the same sentence, which is why splitting them would
 * make two screens out of one question.
 */
export const recurringWork = pgTable('recurring_work', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** contract | asset — see RECUR_KINDS in lib/recurring. */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  /** The client, or where the item lives. */
  forWhom: text('for_whom'),
  /** How often it comes round, in months. Test and tag is usually 12; a service contract varies. */
  everyMonths: integer('every_months').notNull().default(12),
  lastDoneAt: text('last_done_at'),
  /** Worked out from the interval when it was last done — stored so a query can sort on it. */
  nextDueAt: text('next_due_at'),
  /** pass | fail for an item that was tested. Null for a contract. */
  result: text('result'),
  /** The job SPEC raised for it, so "books itself" means something. */
  bookedJobId: text('booked_job_id'),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('recurring_work_tenant').on(t.tenantId),
  index('recurring_work_due').on(t.tenantId, t.nextDueAt),
]).enableRLS();

/**
 * How much of a catalogue item is in a place — a van, or the yard.
 *
 * ── The reorder list is the feature ──────────────────────────────────────────────────────────────
 *
 * A stock register nobody counts is a register that is wrong within a fortnight, and a wrong
 * register is worse than none because people trust it. So this stores the two numbers a reorder
 * list actually needs — how many are here, and how few is too few — and everything else is derived.
 *
 * One row per item per place. `countedAt` is when somebody last physically looked, which is the
 * only thing that makes the number worth anything.
 */
export const stockLevels = pgTable('stock_levels', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  itemId: text('item_id').notNull(),
  /** 'Yard' for the warehouse, or a van's name. Free text: a business names its own vans. */
  place: text('place').notNull(),
  qty: integer('qty').notNull().default(0),
  /** Below this, it goes on the reorder list. Zero means never reorder it automatically. */
  minQty: integer('min_qty').notNull().default(0),
  countedAt: text('counted_at'),
  countedBy: text('counted_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('stock_levels_tenant').on(t.tenantId),
  uniqueIndex('stock_levels_item_place').on(t.tenantId, t.itemId, t.place),
]).enableRLS();

/**
 * What happened on a job, recorded from the phone.
 *
 * ── One table, four things ───────────────────────────────────────────────────────────────────────
 *
 * The design's day runs: sign the SWMS → start → photos → materials used → client sign-off →
 * finish. Four of those are records against a job made by a person at a time, and the only thing
 * that differs is what the record says. So they share a table and a `kind`, the way the safety
 * register does.
 *
 * Starting and finishing are NOT here: they are hours, they already have `timesheet_entries`, and
 * a second place for the same fact is how two numbers disagree.
 */
export const jobRecords = pgTable('job_records', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  jobId: text('job_id').notNull(),
  /** swms | photo | materials | signoff — see DAY_RECORDS in lib/tech-day. */
  kind: text('kind').notNull(),
  /** Who did it — the crew member's name, or the client's for a sign-off. */
  who: text('who').notNull(),
  /** What it says: the SWMS name, the caption, what was used, or what the client signed for. */
  what: text('what').notNull().default(''),
  /**
   * For materials: which catalogue item and how many, so it lands on the job cost rather than
   * being a note nobody prices. Null for the other kinds.
   */
  itemId: text('item_id'),
  qty: integer('qty'),
  /**
   * Where the photo itself is, once there is somewhere to put it.
   *
   * SPEC has no file store yet. A photo is recorded here with its caption, who took it and when —
   * which is the evidence chain — and the image stays on the phone until blob storage is
   * connected. Saying that plainly is better than pretending the picture is safe somewhere.
   */
  fileRef: text('file_ref'),
  atTime: text('at_time').notNull(),
}, t => [
  index('job_records_tenant').on(t.tenantId),
  index('job_records_job').on(t.tenantId, t.jobId),
]).enableRLS();

/*
  ══ Design 17 · get paid and keep them ═══════════════════════════════════════════════════════════

  Callbacks, reviews, tools, tenders and subcontractors. No foreign keys, per the house convention
  for everything added since the CRM block — `tests/crm.test.ts` enforces it.
*/

/**
 * Going back to a job that should have been finished.
 *
 * Its own table rather than a flag on the job, because the hours and the materials of a callback
 * are the cost nobody sees: on a timesheet they look like ordinary work. Counting them separately
 * is the only way rework ever becomes a number. See lib/rework for what each cause means.
 */
export const callbacks = pgTable('callbacks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** The job that had to be gone back to. */
  jobId: text('job_id').notNull(),
  /** workmanship | material | subbie | not_ours — see CAUSES in lib/rework. */
  cause: text('cause').notNull().default('workmanship'),
  what: text('what').notNull().default(''),
  /** Who did the original work. Named to see a pattern, never to blame one person. */
  who: text('who').notNull().default(''),
  minutes: integer('minutes').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  /** What was actually got back, once a claim or a call-out invoice landed. */
  recoveredCents: integer('recovered_cents').notNull().default(0),
  /** open | closed */
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('callbacks_tenant').on(t.tenantId),
  index('callbacks_job').on(t.tenantId, t.jobId),
]).enableRLS();

/**
 * A review somebody left, and the reply.
 *
 * Every paid customer is asked, with the same message and the same link — see the rule at the top
 * of lib/reviews. Nothing here records how a job went before the ask, because nothing is allowed to
 * decide the ask on that basis.
 */
export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  jobId: text('job_id'),
  who: text('who').notNull().default(''),
  stars: integer('stars').notNull().default(5),
  text: text('text').notNull().default(''),
  /** The business's answer. Drafted by SPEC, posted only once somebody approves it. */
  reply: text('reply'),
  repliedAt: text('replied_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('reviews_tenant').on(t.tenantId)]).enableRLS();

/**
 * Every tool the business owns, and who has it.
 *
 * The register exists for three different questions that are the same row: what is it worth for
 * insurance, when is it next due for test and tag or calibration, and which ute is it in. A
 * business that cannot answer the third buys the tool again.
 */
export const tools = pgTable('tools', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  serial: text('serial'),
  /** Whoever has it — a person or a vehicle, in the business's own words. */
  heldBy: text('held_by').notNull().default(''),
  valueCents: integer('value_cents').notNull().default(0),
  /** YYYY-MM-DD, next test and tag or calibration. Null when it needs neither. */
  dueAt: text('due_at'),
  /** held | missing | retired */
  status: text('status').notNull().default('held'),
  lastSeenAt: text('last_seen_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('tools_tenant').on(t.tenantId)]).enableRLS();

/**
 * A tender package: a job that has to be won against other people, on somebody else's timetable.
 *
 * Kept apart from a lead because the decision is different. A lead is followed up; a tender is
 * decided on — go or no-go — and the cost of deciding wrong is a fortnight of estimating given away.
 */
export const tenders = pgTable('tenders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  builder: text('builder').notNull().default(''),
  /** YYYY-MM-DD. */
  dueAt: text('due_at'),
  valueCents: integer('value_cents').notNull().default(0),
  /** How many addenda have landed. Each one is a re-price somebody has to notice. */
  addenda: integer('addenda').notNull().default(0),
  /** none | started | done */
  takeoff: text('takeoff').notNull().default('none'),
  /** open | go | no_go | submitted | won | lost */
  status: text('status').notNull().default('open'),
  /** What the winner came in at, when it is known. The only way a win rate ever improves. */
  winnerCents: integer('winner_cents'),
  decidedBecause: text('decided_because'),
  createdAt: text('created_at').notNull(),
}, t => [index('tenders_tenant').on(t.tenantId)]).enableRLS();

/**
 * A subcontractor, and the six checks that decide whether they can be booked.
 *
 * Kris, 24 September, correcting an earlier draft: subcontractors are people working for the
 * business and are held to the full expectation on every job — a PAID TEAM SEAT, the same SWMS,
 * checklists and KPIs as employees, and their scores count on their supervisor's team board. They
 * still see only their own jobs, never the business's prices.
 */
export const subcontractors = pgTable('subcontractors', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  business: text('business').notNull(),
  contact: text('contact').notNull().default(''),
  mobile: text('mobile').notNull().default(''),
  /** Who they work under. The same reporting line an employee has. */
  reportsToRoleId: text('reports_to_role_id'),
  /** invited | onboarding | active | stood_down */
  status: text('status').notNull().default('invited'),
  invitedAt: text('invited_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('subcontractors_tenant').on(t.tenantId)]).enableRLS();

/**
 * One of the six checks against a subcontractor, with its expiry.
 *
 * A row per check rather than six columns, because each one expires on its own date and each one
 * has its own document. Six columns would make "which one lapsed" a question you answer by reading.
 */
export const subbieChecks = pgTable('subbie_checks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  subbieId: text('subbie_id').notNull(),
  /** abn | subcontract | liability | workers_comp | licence | induction — see CHECKS in lib/subbies. */
  kind: text('kind').notNull(),
  /** YYYY-MM-DD. Null when the check does not expire. */
  expiresAt: text('expires_at'),
  /** missing | current | expired */
  state: text('state').notNull().default('missing'),
  note: text('note'),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('subbie_checks_tenant').on(t.tenantId),
  index('subbie_checks_subbie').on(t.tenantId, t.subbieId),
]).enableRLS();

/**
 * A government incentive or rebate claim for one apprentice.
 *
 * The DATE is the whole point of the row. These are real money a business is entitled to and
 * routinely does not claim — not by decision, but because the window opens on a date buried in a
 * training contract and nobody is watching for it.
 *
 * `amountCents` is null until somebody has confirmed the figure with the Apprenticeship Support
 * Network provider. SPEC never invents one: the amounts change with the scheme, the state, the year
 * of the apprenticeship and the employer, and a made-up number shown as claimable is a business
 * budgeting for money that is not coming. See lib/apprentice-funding.
 */
export const apprenticeClaims = pgTable('apprentice_claims', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** Who it is for, as the business names them. */
  who: text('who').notNull(),
  /** What the claim is, in the provider's own words rather than SPEC's. */
  what: text('what').notNull(),
  opensAt: text('opens_at'),
  closesAt: text('closes_at'),
  amountCents: integer('amount_cents'),
  claimedAt: text('claimed_at'),
  receivedAt: text('received_at'),
  createdAt: text('created_at').notNull(),
}, t => [index('apprentice_claims_tenant').on(t.tenantId)]).enableRLS();

/**
 * The sectors a business works in — its own markets, in its own words.
 *
 * Kris, 24 September: *"jbi has 4 streams - industrial, commercial, renewables and mining"*, and
 * the next morning, settling the word: *"streams commercial, operations and growth - sectors
 * industrial, commercial, mining and renewables but this is jbi"*.
 *
 * A row per business, never a fixed list. Nobody outside JBI knows JBI has four, and a business
 * shown sectors it did not choose keeps them — at which point SPEC has quietly decided what markets
 * somebody works in. `lib/sectors` holds JBI's as an example for an empty screen and applies
 * nothing.
 *
 * Switched off rather than deleted, because a sector a business has left still has years of jobs
 * hanging off it and those jobs have to keep reading correctly.
 */
export const sectors = pgTable('sectors', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  /** What the business wants to see on this stream. Ordering is theirs, not alphabetical. */
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [index('sectors_tenant').on(t.tenantId)]).enableRLS();

/**
 * Each chase that has gone out on a quote, so the same one never goes twice.
 *
 * The same shape as the invoice reminders above, and for the same reason: a record of what was
 * sent is what lets the next one be the RIGHT one. Without it, a quote eleven days out either gets
 * the gentle first nudge eleven days late, or gets all three at once.
 *
 * A row rather than a counter on the quote, because which chase went matters as much as how many —
 * the three say different things, and the third is the one that gets the most answers.
 */
export const quoteChases = pgTable('quote_chases', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** The job the quote belongs to. No foreign key — house convention since the CRM block. */
  jobId: text('job_id').notNull(),
  /** 3, 7 or 14 — which of the ladder this was. */
  day: integer('day').notNull(),
  /** What was actually sent, kept as sent rather than regenerated later. */
  said: text('said'),
  sentAt: text('sent_at').notNull(),
  sentBy: text('sent_by'),
}, t => [
  index('quote_chases_tenant').on(t.tenantId),
  index('quote_chases_job').on(t.tenantId, t.jobId),
]).enableRLS();

/**
 * A shutdown — a project with a date that will not move.
 *
 * Kris, 24 September: JBI does *"both maintenance and project work including shutdowns"*.
 *
 * It is its own table rather than a flag on a job because the thing that has to be tracked is the
 * WINDOW and what has to be true before it opens. The plant starts again on its date whether the
 * work is finished or not, and anything left undone waits for the next shutdown a year away — so
 * crew confirmed and materials ordered are columns, not notes somebody keeps.
 */
export const shutdowns = pgTable('shutdowns', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  sectorId: text('sector_id'),
  client: text('client'),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  crewNeeded: integer('crew_needed').notNull().default(0),
  crewConfirmed: integer('crew_confirmed').notNull().default(0),
  materialsOrdered: boolean('materials_ordered').notNull().default(false),
  createdAt: text('created_at').notNull(),
}, t => [
  index('shutdowns_tenant').on(t.tenantId),
  index('shutdowns_window').on(t.tenantId, t.startsAt),
]).enableRLS();

/**
 * A part of a job that a crew of its own does.
 *
 * Kris, 25 September: *"multi crew is common - split scopes with one supervisor overall"*.
 *
 * "Switchboard", "Lighting", "Final fix" — the business's own words for the parts it splits work
 * into. A lead runs one; the SUPERVISOR on the job runs all of them, and those are deliberately two
 * different fields in two different places, because a job where every scope has a lead and nothing
 * has a supervisor is a job where nobody is answerable for the join.
 */
export const jobScopes = pgTable('job_scopes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** No foreign key — house convention since the CRM block. */
  jobId: text('job_id').notNull(),
  name: text('name').notNull(),
  /** Who runs this part. Not a supervisor — see lib/crews. */
  leadKey: text('lead_key'),
  leadName: text('lead_name'),
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [
  index('job_scopes_tenant').on(t.tenantId),
  index('job_scopes_job').on(t.tenantId, t.jobId),
]).enableRLS();


/**
 * A crew turned up and could not get in.
 *
 * The most common thing that wrecks a day, and the thing almost no trade business counts — because
 * counting it has always meant a call to the office and a note somebody types up later, so it
 * disappears into the day instead. One press on the phone writes this row. See lib/no-access.
 *
 * `because` is nullable on purpose and is asked AFTER the fact is recorded: the reason is the part
 * that stops it being pressed, and a record only made on quiet days is worse than none.
 */
export const noAccessVisits = pgTable('no_access_visits', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  jobId: text('job_id').notNull(),
  who: text('who').notNull(),
  because: text('because'),
  /** Whether the customer was told, which is the half that stops it being an argument later. */
  toldAt: text('told_at'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('no_access_tenant').on(t.tenantId),
  index('no_access_job').on(t.tenantId, t.jobId),
]).enableRLS();


/**
 * A builder's agreed schedule of rates, held against the customer it belongs to.
 *
 * Today these live in a spreadsheet and get typed into every quote, which is where a business loses
 * margin without noticing: a rate typed from memory drifts, and it only ever drifts one way. Nobody
 * finds out, because a quote priced off the wrong rate is not rejected — it is accepted, and the
 * difference comes out of the job. See lib/rate-cards.
 */
export const rateCards = pgTable('rate_cards', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** Which customer. A card with no customer is a spreadsheet again. */
  customerKey: text('customer_key').notNull(),
  customerName: text('customer_name').notNull(),
  name: text('name').notNull(),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('rate_cards_tenant').on(t.tenantId),
  index('rate_cards_customer').on(t.tenantId, t.customerKey),
]).enableRLS();

/** One agreed rate, in the builder's own wording — because that is what the schedule says. */
export const rateCardLines = pgTable('rate_card_lines', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  cardId: text('card_id').notNull(),
  what: text('what').notNull(),
  unit: text('unit').notNull().default('each'),
  cents: integer('cents').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('rate_card_lines_tenant').on(t.tenantId),
  index('rate_card_lines_card').on(t.tenantId, t.cardId),
]).enableRLS();

/**
 * Plant on hire against a job.
 *
 * The quietest margin leak there is: the job finishes and the scissor lift sits on site for three
 * more weeks, because off-hiring it is nobody's specific job. The cost turns up later on an invoice
 * nobody connects to the job it belonged to.
 *
 * The JOB finishing is the trigger — not a reminder somebody sets. The job already knows when it
 * finished and this row already knows which job it is on; the connection is the whole feature.
 */
export const plantHires = pgTable('plant_hires', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  jobId: text('job_id').notNull(),
  what: text('what').notNull(),
  supplier: text('supplier'),
  onHireAt: text('on_hire_at').notNull(),
  offHireAt: text('off_hire_at'),
  /** Null is honest rather than empty: SPEC never invents what a day of hire costs. */
  perDayCents: integer('per_day_cents'),
  createdAt: text('created_at').notNull(),
}, t => [
  index('plant_hires_tenant').on(t.tenantId),
  index('plant_hires_job').on(t.tenantId, t.jobId),
]).enableRLS();

/**
 * Somebody's last day, and which parts of the list have been done.
 *
 * Every piece already exists somewhere — tools on the tools register, the seat on billing, access
 * on the chart — and nothing joined them, so each was done by whoever remembered, which on a last
 * day is nobody. `done` is the keys from LAST_DAY in lib/last-day; the two that bite are a login
 * still open and a seat still being paid for.
 */
export const leavers = pgTable('leavers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  staffId: text('staff_id').notNull(),
  name: text('name').notNull(),
  lastDay: text('last_day').notNull(),
  /** Comma-separated keys. A list this short does not earn a second table. */
  done: text('done').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [index('leavers_tenant').on(t.tenantId)]).enableRLS();

/* ══ Claude recommends, and Switch when ready ══════════════════════════════════════════════════════
 *
 * Kris, 25 September: every decision SPEC helps with runs the same three steps — a recommendation
 * with the numbers behind it, "Ready to do this?", and on Yes SPEC does it and logs it. The figures
 * are always SPEC's own arithmetic (lib/labour-rate-advice, lib/switch); Claude only puts them into
 * words. No AI path writes anything: the write happens on a person's Yes, and it is the action the
 * recommendation named, re-checked on the server first. See lib/recommends.
 */

/**
 * Every answer to a recommendation — append-only, the record of what was decided on what data.
 *
 * `facts` is the numbers as they were shown, kept as written: "what did we know when we did it" is
 * the question that gets asked later, and recomputing it would answer a different one.
 */
export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** `labour_rate`, `switch:payroll`, … — see TOPICS in lib/recommends-data. */
  topic: text('topic').notNull(),
  /** yes | not_yet */
  answer: text('answer').notNull(),
  /** The recommendation answered — the topic and the exact action it named. */
  fingerprint: text('fingerprint').notNull(),
  headline: text('headline').notNull(),
  /** JSON `[{ label, value, note? }]`, as shown. */
  facts: text('facts').notNull().default('[]'),
  /** JSON of the action a Yes carried out. Null for Not yet. */
  action: text('action'),
  /** done | failed — what happened when SPEC did it. Null for Not yet. */
  outcome: text('outcome'),
  decidedBy: text('decided_by').notNull(),
  decidedAt: text('decided_at').notNull(),
}, t => [
  index('decisions_tenant').on(t.tenantId),
  index('decisions_topic').on(t.tenantId, t.topic),
]).enableRLS();

/**
 * Claude's wording of a recommendation, kept so it is written once rather than on every page load.
 *
 * Keyed on `wordsKey` — a hash of the headline, reason and every figure — so wording written for
 * last week's numbers is never shown beside this week's.
 */
export const recommendationWords = pgTable('recommendation_words', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  topic: text('topic').notNull(),
  wordsKey: text('words_key').notNull(),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('recommendation_words_tenant').on(t.tenantId),
  uniqueIndex('recommendation_words_key').on(t.tenantId, t.topic, t.wordsKey),
]).enableRLS();

/**
 * Where a business stands on switching one area to SPEC. One row per area, created on "I want this".
 *
 * Day one changes nothing: a business with no row runs exactly what it ran before. `previous` holds
 * the Coverage choices the switch replaced, so Undo puts back precisely what was there.
 */
export const systemSwitches = pgTable('system_switches', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** accounting | payroll | jobs | crm | people | safety — SWITCH_AREAS in lib/switch. */
  area: text('area').notNull(),
  /** requested | side_by_side | spec. `side_by_side` is Shadow for accounting. */
  state: text('state').notNull().default('requested'),
  requestedBy: text('requested_by').notNull(),
  requestedAt: text('requested_at').notNull(),
  sideBySideAt: text('side_by_side_at'),
  /**
   * When the owner said "I'm ready to switch". Half of what unlocks the switch — the other half is
   * SPEC's own check that it matches what the business runs now (lib/switch, `confirmed`).
   */
  ownerReadyAt: text('owner_ready_at'),
  switchedAt: text('switched_at'),
  switchedBy: text('switched_by'),
  /** JSON `{ capability: 'own' }` — the Coverage rows the switch cleared. */
  previous: text('previous').notNull().default('{}'),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('system_switches_tenant').on(t.tenantId),
  uniqueIndex('system_switches_area').on(t.tenantId, t.area),
]).enableRLS();

/**
 * Something about a switch that was not easy — and the Simple Guarantee claim it makes.
 *
 * `kind` is from a fixed list, so SPEC can count what goes wrong across every business without
 * reading a word any business wrote. `note` is the business's own words and stays inside it.
 * `month` is the month the guarantee covers; one claim per business per month.
 */
export const switchFriction = pgTable('switch_friction', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  area: text('area').notNull(),
  kind: text('kind').notNull(),
  note: text('note'),
  month: text('month').notNull(),
  reportedBy: text('reported_by').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('switch_friction_tenant').on(t.tenantId)]).enableRLS();

/**
 * The Simple Guarantee, paid — one row per business per month, claimed before Stripe is asked, so a
 * month can never be credited twice. See lib/guarantee. `amount` is in the currency's smallest unit;
 * `status` is pending · applied · free (nothing to take off) · failed (tried again next time).
 */
export const guaranteeCredits = pgTable('guarantee_credits', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  month: text('month').notNull(),
  status: text('status').notNull().default('pending'),
  amount: integer('amount').notNull().default(0),
  currency: text('currency'),
  stripeTransactionId: text('stripe_transaction_id'),
  error: text('error'),
  reportedBy: text('reported_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('guarantee_credits_tenant_month').on(t.tenantId, t.month)]).enableRLS();

/**
 * The weekly Make it simple report — one per business per meeting, kept as written.
 *
 * Kris, 25 September: every week, before the COGS meeting, what got simpler, the top three things
 * still complicated (each a Claude recommends fix), what is ready to switch, and any friction logged
 * against the Simple Guarantee. A report is a snapshot: the figures it went into the meeting with are
 * the ones it keeps, which is also how next week's report can say what moved.
 */
export const simpleReports = pgTable('simple_reports', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** The meeting it is for — its date, or the Monday of its week when no day is set. */
  meetingDate: text('meeting_date').notNull(),
  /** JSON — `SimpleReport` in lib/make-it-simple. */
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [
  index('simple_reports_tenant').on(t.tenantId),
  uniqueIndex('simple_reports_meeting').on(t.tenantId, t.meetingDate),
]).enableRLS();

/**
 * Figures read from a report the business exported from its own accounting system — Xero or MYOB,
 * saved as CSV — for /financials when nothing is connected. Manual is a complete mode: this is how a
 * business with no connection still sees its money.
 *
 * Only the figures are kept, never the file: cash, profit this month and last, GST, wages, who owes
 * the business and who it owes (`Figures` in lib/financials, as JSON, in cents). Each upload is its
 * own row; the newest is what the page reads.
 */
export const ledgerUploads = pgTable('ledger_uploads', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  fileName: text('file_name').notNull(),
  /** JSON — `Figures` in lib/financials. */
  figures: text('figures').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('ledger_uploads_tenant').on(t.tenantId, t.createdAt)]).enableRLS();

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Design 19 — adoption, the money reviews, the pay run, and the prompts people confirmed
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Which of the nine areas of the owner's job are running in siteVIP, and what the rest run in.
 *
 * A row per area the business has said something about. No row means not running here — the absence
 * is the default rather than something that has to be written, so a business that has never opened
 * the setting reads correctly on day one.
 *
 * Pay never appears here in any meaningful way: it is always on (see AREAS in lib/adoption), and the
 * tile ignores any row that says otherwise. That is deliberate belt-and-braces — an earlier version
 * of the design had Pay staged, and the note is still in the design file for somebody to read.
 */
export const adoptionAreas = pgTable('adoption_areas', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** One of AREAS in lib/adoption. */
  areaKey: text('area_key').notNull(),
  runningHere: boolean('running_here').notNull().default(false),
  /** What it runs in instead, in the business's own words: "Simpro", "HubSpot". */
  elsewhere: text('elsewhere'),
  /** Whether that system is connected, so this area still feeds the Power Meter. */
  connected: boolean('connected').notNull().default(false),
  turnedOnAt: text('turned_on_at'),
  updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('adoption_areas_one').on(t.tenantId, t.areaKey)]).enableRLS();

/**
 * One of the eight financial reviews, for one period, with SPEC's written finding.
 *
 * `finding` is nullable and null is a real state: a review SPEC could not write. The screen says
 * that out loud rather than printing "no issues found", because a report that could not be produced
 * and a clean bill of health are different things and a business betting its tax position on one
 * must not have them confused.
 *
 * Signing is what turns a document into a decision with a date on it, and only signed reviews go
 * into the board pack.
 */
export const financeReviews = pgTable('finance_reviews', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** One of REVIEWS in lib/angus. */
  reviewKey: text('review_key').notNull(),
  /** The period it covers, as the first day of it. */
  periodStart: text('period_start').notNull(),
  finding: text('finding'),
  /** Where the figures came from when it was written: 'angus' or the connector's name. */
  fromSource: text('from_source'),
  signedAt: text('signed_at'),
  signedBy: text('signed_by'),
  createdAt: text('created_at').notNull(),
}, t => [
  uniqueIndex('finance_reviews_one').on(t.tenantId, t.reviewKey, t.periodStart),
  index('finance_reviews_tenant').on(t.tenantId, t.periodStart),
]).enableRLS();

/** One check against one pay run. Absent means NOT RUN, which blocks approval exactly as a failure does. */
export const payRunChecks = pgTable('pay_run_checks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  payRunId: text('pay_run_id').notNull(),
  /** One of CHECKS in lib/pay-run. */
  checkKey: text('check_key').notNull(),
  /** 'passed' or 'failed'. There is no stored 'not_run' — that is what a missing row means. */
  state: text('state').notNull(),
  says: text('says').notNull(),
  /** Who it is about, where it is about one person. */
  who: text('who'),
  ranAt: text('ran_at').notNull(),
}, t => [
  uniqueIndex('pay_run_checks_one').on(t.payRunId, t.checkKey),
  index('pay_run_checks_tenant').on(t.tenantId),
]).enableRLS();

/**
 * A rate that is set by law, changes, and differs by award and by year.
 *
 * `value` with no `source` does not count as set — see isSet in lib/pay-run. That is not
 * bureaucracy: it is what lets a business answer "where did this rate come from" eighteen months
 * later, which is the question an audit actually asks. A rate SPEC invented and applied to
 * somebody's pay would be worse than no rate, because it looks like it was checked.
 */
export const legalRates = pgTable('legal_rates', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  rateKey: text('rate_key').notNull(),
  label: text('label').notNull(),
  value: real('value'),
  unit: text('unit').notNull().default('percent'),
  source: text('source'),
  checkedAt: text('checked_at'),
  /** A change SPEC has seen and the business has not yet accepted. Never applied silently. */
  pendingTo: real('pending_to'),
  pendingFrom: text('pending_from'),
  pendingSource: text('pending_source'),
  updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('legal_rates_one').on(t.tenantId, t.rateKey)]).enableRLS();

/**
 * Somebody pressed "Yes, it's right" on a gentle prompt.
 *
 * The whole safety net of lib/gentle. One confirmed fourteen-hour day is a Tuesday; five in a
 * fortnight is something the business needs to know about, and it surfaces as a conversation rather
 * than as a blocked timesheet at six o'clock on site.
 */
export const gentleConfirmations = pgTable('gentle_confirmations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** One of GentleKey in lib/gentle. */
  promptKey: text('prompt_key').notNull(),
  who: text('who').notNull(),
  /** What they confirmed, so the leader reading it later does not have to go and find out. */
  what: text('what').notNull(),
  /** Where it happened, so it can be opened. */
  about: text('about'),
  createdAt: text('created_at').notNull(),
}, t => [index('gentle_confirmations_tenant').on(t.tenantId, t.createdAt)]).enableRLS();
