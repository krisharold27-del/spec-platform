/**
 * Every workflow a trade business runs, and where in SPEC each one happens.
 *
 * ── Why this is not the Coverage map ────────────────────────────────────────────────────────────
 *
 * Kris, 24 September: *"i want to map all the possible workflows a tradie business could have and
 * make sure this system can do them all"*.
 *
 * `lib/coverage` answers a different question — "is there a feature for X" — and it can read
 * thirty-eight out of thirty-eight while a business still cannot get through its Tuesday. A
 * capability is a thing the product HAS. A workflow is a thing a business DOES, start to finish,
 * and it is the join between features that breaks: the quote exists and the job exists, and the
 * step where one becomes the other is nobody's. A feature list cannot show that hole. A list of
 * journeys, each with its trigger and its finish line, is exactly the shape that can.
 *
 * So this file is the second map, and the two are checked against each other rather than merged.
 *
 * ── The rule that stops this becoming a brochure ────────────────────────────────────────────────
 *
 * A step's `where` is the screen it happens on — or `null`, which means SPEC has no home for it
 * yet. `stateOf` DERIVES whether a workflow is whole from those nulls; there is no field anybody
 * can set to say "done". That is deliberate. A status somebody types is a status that stops being
 * true the first time a screen is renamed and nobody remembers this file exists, and a map that
 * quietly stops being true is worse than no map, because the next decision gets made on it.
 *
 * `tests/workflows.test.ts` then resolves every `where` against the routes that actually exist on
 * disk, so deleting a screen breaks the map instead of silently hollowing it out.
 *
 * ── Honest about the gaps ───────────────────────────────────────────────────────────────────────
 *
 * Several workflows below are `partial`, with the missing step named in the business's own words.
 * They are in the list precisely BECAUSE they are missing — a map with the awkward rows left off
 * is a map that agrees with whoever drew it. The point of drawing this was to find them.
 *
 * ── Outsimple them ──────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September: *"no workflow with any extra steps — (why simpro is annoying) concentrating
 * on the OUTSIMPLE THEM mantra — thats our market to own"*.
 *
 * This is the half that matters, because "can it do it" is table stakes. Every system in this
 * market can do every workflow below. They are annoying anyway, and the reason is always the same
 * shape: doing one thing makes you go somewhere else. Take the call here, raise the job there,
 * schedule it on a third screen, and the person who set out to book a job has visited four places
 * to do it.
 *
 * So every step carries `by` — WHO does it — and one rule is enforced across the whole map:
 *
 *   **No single person is sent to more than one place to finish one workflow.**
 *
 * A place is a screen, not a tab: moving between tabs inside Jobs is staying put, and `placeOf`
 * says so by dropping the query. `by: 'spec'` marks the steps that happen by themselves, and those
 * are free — they are the ones that make the difference, because every step SPEC does is a step
 * nobody has to be trained to remember.
 *
 * `tests/workflows.test.ts` fails when any workflow breaks that rule. It is a ceiling on the
 * product, deliberately set where it will bite: it is meant to be the thing that stops the tenth
 * feature being bolted onto its own screen because that was the easy place to put it.
 */

import { FRAMEWORK } from './power-meter';

/** A measure on the Virtual GM Power Meter. The ids are `power-meter`'s own, never a second list. */
export type SlotId = (typeof FRAMEWORK)[number]['id'];

/** The seven things a trade business is doing at any moment. In the order the money moves. */
export const FAMILIES = [
  { key: 'win', label: 'Winning work', blurb: 'From the phone ringing to a signed yes.' },
  { key: 'do', label: 'Doing the work', blurb: 'From a job on the board to a customer who has signed it off.' },
  { key: 'buy', label: 'Materials, tools and plant', blurb: 'Everything that has to be bought, carried, counted or tested.' },
  { key: 'people', label: 'People', blurb: 'From somebody’s first morning to their last.' },
  { key: 'safe', label: 'Safety and compliance', blurb: 'The ones where getting it wrong ends the business, not the week.' },
  { key: 'money', label: 'Getting paid', blurb: 'From the first claim to money actually in the account.' },
  { key: 'run', label: 'Running the business', blurb: 'The rhythm that stops the other six drifting.' },
] as const;

export type FamilyKey = (typeof FAMILIES)[number]['key'];

/**
 * Who does a step.
 *
 * `spec` is the important one: a step SPEC performs by itself costs nobody anything, and the ratio
 * of `spec` steps to human ones is the whole difference between this and what Kris walked away from.
 */
export type Actor =
  | 'field'     // somebody on site, on a phone, in the rain
  | 'office'    // whoever is at a desk — admin, estimator, the person running the day
  | 'leader'    // the person who has to decide or approve
  | 'worker'    // an employee acting for themselves, not for the business
  | 'customer'  // the person paying
  | 'spec';     // nobody. It happens.

export const ACTORS: { key: Actor; label: string }[] = [
  { key: 'field', label: 'On site' },
  { key: 'office', label: 'In the office' },
  { key: 'leader', label: 'Whoever decides' },
  { key: 'worker', label: 'The person themselves' },
  { key: 'customer', label: 'The customer' },
  { key: 'spec', label: 'SPEC, by itself' },
];

export interface Step {
  /** What happens, said the way somebody in the business would say it. */
  does: string;
  /** Who has to do it. `spec` means nobody — and those are the ones worth counting. */
  by: Actor;
  /**
   * The screen it happens on — or `null` when SPEC has nowhere for it yet.
   *
   * Null is the whole point of the type. It is not an oversight to be tidied up later; it is the
   * one thing this file exists to record, and `gap` beside it says what the business does instead.
   */
  where: string | null;
  /** Required when `where` is null: what is missing, and what it costs. */
  gap?: string;
}

export interface Workflow {
  id: string;
  family: FamilyKey;
  name: string;
  /** What sets it off. A workflow with no trigger is a feature. */
  starts: string;
  /** How you know it is finished. A workflow with no finish line never gets closed. */
  ends: string;
  /**
   * Which of the Power Meter's twenty-five this workflow actually moves.
   *
   * Kris, 24 September: *"all work flows should be working to improve spec and the GM Power Meter
   * score"*. So no workflow is allowed to move nothing. A workflow that shifts no measure is
   * either busywork the business should stop doing, or proof that the thing it improves is not
   * being measured — and both of those are worth knowing, which is why it is a rule and not a
   * field somebody may leave empty.
   *
   * The check runs the other way too, and that direction is the sharper one: every slot on the
   * meter must be moved by at least one workflow. A score with no workflow behind it is a number
   * that tells a business it is failing and gives it nothing to do about it, which is the exact
   * thing a dashboard becomes when nobody is watching.
   */
  moves: SlotId[];
  steps: Step[];
}

const W = (
  family: FamilyKey, id: string, name: string, starts: string, ends: string,
  moves: SlotId[], steps: Step[],
): Workflow => ({ id, family, name, starts, ends, moves, steps });

/** A step that has nowhere to happen yet. Reads at the call site as what it is. */
const nowhere = (by: Actor, does: string, gap: string): Step => ({ does, by, where: null, gap });

export const WORKFLOWS: Workflow[] = [
  /* ── Winning work ──────────────────────────────────────────────────────────────────────────── */

  W('win', 'phone-enquiry', 'The phone rings',
    'Somebody calls wanting a price or a sparkie out.',
    'It is on the board with a name against it, or booked.', ['revenue_growth', 'productivity'], [
    { does: 'Take the details while they are on the phone.', by: 'office', where: '/jobs?tab=leads' },
    { does: 'It lands on the list with its age against the two-day target.', by: 'spec', where: '/jobs?tab=leads' },
    { does: 'Either book it straight in, or send a price.', by: 'office', where: '/jobs?tab=schedule' },
  ]),

  W('win', 'web-enquiry', 'An enquiry comes in online',
    'Somebody fills in the form on the website.',
    'Same list as a phone call, with where it came from recorded.', ['revenue_growth'], [
    { does: 'The enquiry arrives and joins the same queue as a phone call.', by: 'spec', where: '/jobs?tab=leads' },
    { does: 'Where it came from is kept, so the business can see what actually works.', by: 'spec', where: '/jobs?tab=ace' },
  ]),

  W('win', 'repeat-call', 'A customer you already have rings back',
    'A name already in the system calls.',
    'The new job sits under their history, not as a stranger.', ['revenue_growth'], [
    { does: 'Find them and see every job they have ever had, without leaving Jobs.', by: 'office', where: '/jobs?tab=customers' },
    { does: 'Raise the new one against the same customer and site.', by: 'office', where: '/jobs?tab=customers' },
  ]),

  W('win', 'quote-build', 'Build and send a quote',
    'A lead that needs a price.',
    'Sent, with the margin known before it went.', ['gross_profit', 'revenue_budget'], [
    { does: 'Price it from the catalogue and the kits.', by: 'office', where: '/jobs?tab=quotes' },
    { does: 'Margin worked out as you go, against the benchmark.', by: 'spec', where: '/jobs?tab=quotes' },
    { does: 'Sent to the customer.', by: 'office', where: '/jobs?tab=quotes' },
  ]),

  W('win', 'quote-accept', 'The customer accepts',
    'They say yes — online or on the phone.',
    'A job exists, carrying the quote’s prices as its budget.', ['revenue_budget', 'revenue_growth'], [
    { does: 'They accept on their own page, without an account.', by: 'customer', where: '/customer' },
    { does: 'The quote becomes a job, and its prices become the budget.', by: 'spec', where: '/jobs?tab=pipeline' },
  ]),

  W('win', 'quote-chase', 'Chase a quote nobody answered',
    'A quote has been out longer than it should be.',
    'Answered, or marked lost with a reason.', ['revenue_budget'], [
    { does: 'Quotes waiting too long are named without anybody remembering to look.', by: 'spec', where: '/jobs?tab=quotes' },
    { does: 'Chase it, and record that you did.', by: 'office', where: '/jobs?tab=quotes' },
  ]),

  W('win', 'quote-lost', 'Record why one was lost',
    'They went elsewhere.',
    'The reason is in the system, not in somebody’s head.', ['revenue_growth'], [
    { does: 'Mark it lost with the reason — price, timing, or never heard back.', by: 'office', where: '/jobs?tab=quotes' },
    { does: 'The pattern across lost quotes shows up on the Sales Ace.', by: 'spec', where: '/jobs?tab=ace' },
  ]),

  W('win', 'tender-invite', 'A builder invites you to tender',
    'An invitation with a closing date.',
    'Submitted before it closes, or declined on purpose rather than by accident.', ['revenue_growth', 'revenue_budget'], [
    { does: 'The tender goes on with its closing date.', by: 'office', where: '/jobs?tab=tenders' },
    { does: 'Count off the plans.', by: 'office', where: '/jobs?tab=takeoff' },
    { does: 'Price it and submit.', by: 'office', where: '/jobs?tab=tenders' },
  ]),

  W('win', 'takeoff', 'Count off the plans',
    'A set of drawings.',
    'A priced quantity list you can quote from.', ['gross_profit'], [
    { does: 'Count what is on the drawings, by type.', by: 'office', where: '/jobs?tab=takeoff' },
    { does: 'Turn the counts into a priced quote.', by: 'office', where: '/jobs?tab=quotes' },
  ]),

  W('win', 'rate-card', 'Work to a builder’s schedule of rates',
    'A builder gives you an agreed rate card and sends work against it.',
    'Every job under that agreement prices itself off the agreed rates.', ['gross_profit'], [
    { does: 'Work comes in against an existing agreement rather than as a fresh quote.', by: 'office', where: '/jobs?tab=leads' },
    nowhere('office', 'Hold the agreed rate card against the customer, so a job under it prices itself.',
      'There is no rate card on a customer. Today the rates live in a spreadsheet and get typed in per quote, which is exactly where a business loses margin without noticing.'),
  ]),

  W('win', 'maintenance-sale', 'Sell a maintenance agreement',
    'A customer with equipment that needs looking at on an interval.',
    'An agreement that raises its own jobs.', ['revenue_growth', 'cash_flow'], [
    { does: 'Set the agreement up with its interval.', by: 'office', where: '/jobs?tab=service' },
    { does: 'When it comes due, one press raises the job.', by: 'office', where: '/jobs?tab=service' },
  ]),

  W('win', 'estimate-accuracy', 'Find out whether you price it right',
    'A finished job that was quoted.',
    'The next quote for that work is priced off what it really takes.', ['gross_profit', 'productivity'], [
    { does: 'Quoted hours against actual hours, by type of work.', by: 'spec', where: '/jobs?tab=howlong' },
    { does: 'What that does to margin.', by: 'spec', where: '/jobs?tab=wip' },
  ]),

  /* ── Doing the work ────────────────────────────────────────────────────────────────────────── */

  W('do', 'book-job', 'Put a job on the board',
    'Work that has been won.',
    'It has a day, a crew and a customer who knows when.', ['productivity', 'licensing'], [
    { does: 'It goes on the board.', by: 'office', where: '/jobs?tab=pipeline' },
    { does: 'Drag a crew onto a day.', by: 'office', where: '/jobs?tab=schedule' },
    { does: 'Nobody who is not clear to work can be put on it.', by: 'spec', where: '/safety?tab=clear' },
  ]),

  W('do', 'dispatch', 'Send the crew out',
    'The day starts.',
    'Everybody knows where they are going and the customer knows you are coming.', ['productivity'], [
    { does: 'Each person sees their own day on their phone.', by: 'field', where: '/tech-day' },
    { does: 'The customer gets told you are on the way, with an ETA.', by: 'spec', where: '/customer' },
  ]),

  W('do', 'prestart', 'Take 5 before anything starts',
    'Arriving on site.',
    'Five questions answered, and the job cannot start until they are.', ['safety_incident', 'near_miss'], [
    { does: 'Five questions on the phone, before the job list.', by: 'field', where: '/tech-day' },
    { does: 'An answer that says the job is not safe stops it there.', by: 'spec', where: '/tech-day' },
    { does: 'It lands on the safety record without anybody filing it.', by: 'spec', where: '/safety?tab=site' },
  ]),

  W('do', 'swms', 'The SWMS for this job',
    'Work that needs a safe work method statement.',
    'Signed by everybody on it before work starts.', ['safety_incident', 'regulatory'], [
    { does: 'The kit for the job says which SWMS applies.', by: 'spec', where: '/jobs?tab=prebuilds' },
    { does: 'The crew signs on to it.', by: 'field', where: '/safety?tab=site' },
  ]),

  W('do', 'site-induction', 'Get onto a builder’s site',
    'A commercial site that will not let you through the gate without an induction.',
    'Everybody going has been inducted, and it is on record.', ['training_done', 'licensing'], [
    { does: 'Record the induction against the person.', by: 'office', where: '/people?mode=setup' },
    { does: 'Somebody without one is not clear to work.', by: 'spec', where: '/safety?tab=clear' },
  ]),

  W('do', 'day-on-phone', 'A tradie’s day',
    'Waking up with jobs on.',
    'Every job either finished with evidence, or handed on with a reason.', ['productivity', 'gross_profit'], [
    { does: 'Take 5 first, to set the day up right.', by: 'field', where: '/tech-day' },
    { does: 'Then the jobs, one at a time.', by: 'field', where: '/tech-day' },
    { does: 'Materials used land on the job cost as they are added.', by: 'spec', where: '/jobs?tab=catalogue' },
    { does: 'Finish it on the phone.', by: 'field', where: '/tech-day' },
  ]),

  W('do', 'photos', 'Photos from site',
    'Something worth a picture — before, after, or a problem.',
    'On the job, visible to the business and nobody else.', ['contract_breach', 'audit'], [
    { does: 'Take it on the phone, against the job.', by: 'field', where: '/tech-day' },
    { does: 'It shows on the job under From site.', by: 'spec', where: '/jobs?tab=pipeline' },
  ]),

  W('do', 'variation', 'Extra work found on site',
    'The job turns out to be bigger than the quote.',
    'Priced and agreed BEFORE it is done, with a name against it.', ['gross_profit', 'contract_breach'], [
    { does: 'Price the extra on the phone while you are standing there.', by: 'field', where: '/tech-day' },
    { does: 'The customer agrees it, with their name recorded.', by: 'customer', where: '/customer' },
    { does: 'SPEC refuses to bill one that was never agreed.', by: 'spec', where: '/jobs?tab=billing' },
  ]),

  W('do', 'sign-off', 'The customer signs it off',
    'The work is done.',
    'Signed, and the invoice can go.', ['debtor_days', 'contract_breach'], [
    { does: 'They sign on the phone, on site.', by: 'customer', where: '/tech-day' },
    { does: 'Sign-off is what releases the invoice.', by: 'spec', where: '/jobs?tab=billing' },
  ]),

  W('do', 'job-hold', 'A job stuck waiting on something',
    'Materials, access, an answer, or another trade.',
    'It is visibly waiting, with a reason, instead of quietly rotting.', ['cash_flow', 'productivity'], [
    { does: 'Put it on hold with what it is waiting for.', by: 'office', where: '/jobs?tab=pipeline' },
    { does: 'Held jobs show as money not moving.', by: 'spec', where: '/jobs?tab=wip' },
  ]),

  W('do', 'no-access', 'Turn up and nobody is home',
    'The crew is on the doorstep and cannot get in.',
    'The visit is recorded, the customer is told, and it is rebooked.', ['productivity'], [
    { does: 'The tradie is standing there now and needs one button.', by: 'field', where: '/tech-day' },
    nowhere('field', 'Record a no-access, tell the customer, and rebook it — in one press, from the doorstep.',
      'Today it is a phone call to the office and a note. A no-access costs an hour of a crew and is the single most common thing that wrecks a day, and SPEC does not count them — so nobody can see which customers do it repeatedly.'),
  ]),

  W('do', 'multi-day', 'A project over weeks',
    'A job too big for one visit.',
    'Every stage finished, claimed and closed.', ['gross_profit', 'cash_flow', 'contract_breach'], [
    { does: 'Split it into stages.', by: 'office', where: '/jobs?tab=pipeline' },
    { does: 'Book crew across the days it needs.', by: 'office', where: '/jobs?tab=schedule' },
    { does: 'Claim by stage as each one is done.', by: 'office', where: '/jobs?tab=billing' },
    { does: 'Budget against actual, live, while there is still time to act.', by: 'spec', where: '/jobs?tab=wip' },
  ]),

  W('do', 'subbie-out', 'Put a subbie on the job',
    'More work than your own crew can cover.',
    'The subbie is on the job, checked, and their claim is paid against it.', ['licensing', 'regulatory', 'gross_profit'], [
    { does: 'Their insurances, licences and checks are current — all six.', by: 'office', where: '/people?mode=subbies' },
    { does: 'A subbie missing any of the six cannot be booked.', by: 'spec', where: '/people?mode=subbies' },
    { does: 'Their claim goes against the job cost.', by: 'spec', where: '/jobs?tab=billing' },
  ]),

  W('do', 'subbie-in', 'You are the subbie',
    'A builder engages you on their job.',
    'You claim on their schedule and get paid.', ['contract_breach', 'cash_flow'], [
    { does: 'The builder is the customer and their site is the job.', by: 'office', where: '/jobs?tab=customers' },
    { does: 'Claim progressively against their schedule.', by: 'office', where: '/jobs?tab=billing' },
    { does: 'Retention they hold is tracked and released.', by: 'spec', where: '/jobs?tab=billing' },
  ]),

  W('do', 'defect-return', 'Go back and fix it',
    'A callback — something you did is not right.',
    'Fixed, and the cause is recorded so it stops happening.', ['gross_profit', 'snap_score'], [
    { does: 'The callback is raised against the original job.', by: 'office', where: '/jobs?tab=rework' },
    { does: 'The cause is one of four, not a free-text excuse.', by: 'office', where: '/jobs?tab=rework' },
    { does: 'Rework as a share of work, against the target.', by: 'spec', where: '/jobs?tab=rework' },
  ]),

  /* ── Materials, tools and plant ────────────────────────────────────────────────────────────── */

  W('buy', 'supplier-pickup', 'Pick it up from the supplier',
    'The crew needs gear today.',
    'It is on the job cost, not on a docket in a glovebox.', ['gross_profit'], [
    { does: 'Add what was bought against the job.', by: 'field', where: '/tech-day' },
    { does: 'It lands on the job cost.', by: 'spec', where: '/jobs?tab=catalogue' },
  ]),

  W('buy', 'purchase-order', 'Raise a purchase order',
    'Materials a job needs ordering.',
    'Ordered against the job, with the order on record.', ['gross_profit', 'budget_miss'], [
    { does: 'Raise the order against the job.', by: 'office', where: '/jobs?tab=stock' },
  ]),

  W('buy', 'supplier-bill', 'Match the supplier’s invoice',
    'The bill arrives.',
    'Paid, or held because it does not match the order.', ['budget_miss', 'gross_profit'], [
    { does: 'Record the bill against its order.', by: 'office', where: '/jobs?tab=stock' },
    { does: 'A bill higher than its order holds payment until somebody says why.', by: 'spec', where: '/jobs?tab=stock' },
  ]),

  W('buy', 'price-rise', 'The supplier puts prices up',
    'A new price file.',
    'The catalogue is repriced and every quote already out with the old price is named.', ['gross_profit'], [
    { does: 'Paste in the supplier’s price file.', by: 'office', where: '/jobs?tab=catalogue' },
    { does: 'Anything up more than 5% is named, because quotes already out are now wrong.', by: 'spec', where: '/jobs?tab=catalogue' },
  ]),

  W('buy', 'van-stock', 'Keep the vans stocked',
    'A van is short of what the week needs.',
    'A reorder list that becomes an order in one press.', ['productivity'], [
    { does: 'See what is on each van and in the yard.', by: 'office', where: '/jobs?tab=stock' },
    { does: 'The reorder list is built from the schedule ahead.', by: 'spec', where: '/jobs?tab=stock' },
  ]),

  W('buy', 'stocktake', 'Count the stock',
    'Time to count.',
    'Counted, with the date on it.', ['gross_profit'], [
    { does: 'Count, and the last-counted date is kept.', by: 'field', where: '/jobs?tab=stock' },
  ]),

  W('buy', 'catalogue-health', 'Keep the catalogue streamlined',
    'The catalogue grows every time somebody adds a one-off.',
    'It stays fast, and the business is told before it does not.', ['productivity'], [
    { does: 'Dead items are counted against the size of the catalogue.', by: 'spec', where: '/jobs?tab=catalogue' },
    { does: 'The business is told only when it is BOTH big and mostly dead — not every day.', by: 'spec', where: '/jobs?tab=catalogue' },
  ]),

  W('buy', 'tool-issue', 'Give somebody a tool',
    'A tool goes out with a person or a van.',
    'It is known who has it and when it is next due for test.', ['safety_actions', 'licensing'], [
    { does: 'The tool is assigned.', by: 'office', where: '/jobs?tab=tools' },
    { does: 'Its next test date is worked out from the interval.', by: 'spec', where: '/jobs?tab=tools' },
  ]),

  W('buy', 'test-and-tag', 'Test and tag',
    'Items due for testing.',
    'Every item tested, with the result and the next date.', ['regulatory', 'audit', 'safety_actions'], [
    { does: 'Each item with its result, photo and next due date.', by: 'field', where: '/jobs?tab=service' },
    { does: 'A failed item outranks any date and becomes a job.', by: 'spec', where: '/jobs?tab=service' },
  ]),

  W('buy', 'vehicles', 'Utes, trailers and plant',
    'Rego, servicing and weekly checks come due.',
    'Nothing on the road out of rego or unchecked.', ['regulatory', 'safety_incident'], [
    { does: 'Rego and servicing for every vehicle and bit of plant.', by: 'office', where: '/jobs?tab=tools' },
    { does: 'The weekly ute check, done on the phone.', by: 'field', where: '/safety?tab=site' },
  ]),

  W('buy', 'plant-hire', 'Hire a scissor lift',
    'A job needs plant you do not own.',
    'Off-hired the day it is finished with, not three weeks later.', ['gross_profit', 'budget_miss'], [
    { does: 'The job needs plant.', by: 'office', where: '/jobs?tab=pipeline' },
    nowhere('office', 'Put it on hire against the job, and be told to off-hire it when the job finishes.',
      'There is no on-hire/off-hire register. Hire that runs past the job is one of the quietest margin leaks in the trade — the cost lands weeks later on a bill nobody connects to the job.'),
  ]),

  /* ── People ───────────────────────────────────────────────────────────────────────────────── */

  W('people', 'onboard-employee', 'Set up a new employee',
    'Somebody starts.',
    'They can be booked on a job, and the seat is paid for.', ['training_done', 'licensing', 'turnover'], [
    { does: 'They are on the chart, as team or leadership.', by: 'office', where: '/people?mode=setup' },
    { does: 'Company email — which is their login for the job system.', by: 'office', where: '/people?mode=setup' },
    { does: 'Licences with expiry dates, and their induction.', by: 'office', where: '/people?mode=setup' },
    { does: 'Their training path comes from the role, not from a list somebody keeps.', by: 'spec', where: '/training' },
    { does: 'Payment is finalised once everybody has a role — not once every certificate is in.', by: 'office', where: '/people?mode=setup' },
  ]),

  W('people', 'phone-setup', 'The person does their half on their phone',
    'The office sends them a link.',
    'Their licences and tickets are in, photographed from their own wallet.', ['licensing', 'training_done'], [
    { does: 'The office sends a link, and can see how far they have got.', by: 'office', where: '/people?mode=setup' },
    nowhere('worker', 'The person opens the link on their phone and adds their own licences and tickets.',
      'The link is issued and its progress is shown, but the page it opens is not built. Until it is, the HR admin types thirty-eight people’s certificates off photocopies — which is the exact job this was meant to remove.'),
  ]),

  W('people', 'onboard-apprentice', 'Take on an apprentice',
    'An apprentice starts.',
    'Set up like anybody else, and the funding that applies is claimed.', ['training_done', 'turnover'], [
    { does: 'Set up the same as any employee.', by: 'office', where: '/people?mode=setup' },
    { does: 'Their training contract and stage.', by: 'office', where: '/training' },
    { does: 'Funding that applies is named, with what to claim and when.', by: 'spec', where: '/people?mode=pay' },
  ]),

  W('people', 'onboard-subbie', 'Take on a subcontractor',
    'A subbie is engaged.',
    'All six checks current, or they cannot be booked.', ['licensing', 'regulatory'], [
    { does: 'Ticked as a subcontractor rather than an employee.', by: 'office', where: '/people?mode=setup' },
    { does: 'All six checks: insurances, licence, ABN and the rest.', by: 'office', where: '/people?mode=subbies' },
    { does: 'Anything within 30 days of expiring is chased.', by: 'spec', where: '/people?mode=subbies' },
  ]),

  W('people', 'timesheet', 'Hours to payroll',
    'The week ends.',
    'Approved hours, costed to jobs, ready for the pay run.', ['productivity', 'gross_profit'], [
    { does: 'Hours come from Start and Finish on the phone.', by: 'field', where: '/tech-day' },
    { does: 'They cost to the job as they arrive.', by: 'spec', where: '/jobs?tab=time' },
    { does: 'Approved before the run.', by: 'office', where: '/jobs?tab=time' },
    { does: 'Checked against award rates and allowances BEFORE the run goes, not after.', by: 'spec', where: '/people?mode=pay' },
  ]),

  W('people', 'leave', 'Somebody wants time off',
    'A leave request.',
    'Approved or not, and the schedule knows.', ['absenteeism'], [
    { does: 'Requested on the phone.', by: 'worker', where: '/my-page' },
    { does: 'Approved in one tap, and balances stay current.', by: 'leader', where: '/people' },
    { does: 'Who is available shows on the schedule.', by: 'spec', where: '/jobs?tab=schedule' },
  ]),

  W('people', 'licence-expiry', 'A licence is about to run out',
    'An expiry date coming up.',
    'Renewed before it stops somebody working.', ['licensing', 'regulatory'], [
    { does: 'Expiring licences are named ahead of time.', by: 'spec', where: '/compliance' },
    { does: 'An expired one already stops them being booked.', by: 'spec', where: '/safety?tab=clear' },
  ]),

  W('people', 'training-assign', 'Somebody needs training',
    'A role with a training path, or a gap found in a review.',
    'Finished, and on record against the role.', ['training_done', 'dev_plans'], [
    { does: 'The path comes from the role on the chart.', by: 'spec', where: '/training' },
    { does: 'What is done, due or overdue.', by: 'spec', where: '/training' },
  ]),

  W('people', 'review', 'A performance review',
    'The review falls due.',
    'A conversation held on real numbers, recorded.', ['engagement', 'dev_plans', 'turnover'], [
    { does: 'The last three months of their KPI board is the agenda.', by: 'leader', where: '/people?mode=conduct' },
    { does: 'Their own scorecard, which they can see too.', by: 'worker', where: '/my-page' },
  ]),

  W('people', 'warning', 'Something has to be addressed',
    'Conduct or performance that cannot be left.',
    'A fair process, every step recorded, none skipped.', ['turnover', 'regulatory'], [
    { does: 'Five steps, in order.', by: 'leader', where: '/people?mode=conduct' },
    { does: 'SPEC refuses any step but the next one.', by: 'spec', where: '/people?mode=conduct' },
  ]),

  W('people', 'hire', 'Fill an empty seat',
    'A seat on the chart with nobody in it.',
    'Somebody starts in it.', ['turnover', 'dev_plans'], [
    { does: 'The vacancy comes from the empty seat, not a job ad somebody wrote.', by: 'spec', where: '/people?mode=hiring' },
    { does: 'Candidates scored against the KPIs the role actually holds.', by: 'office', where: '/people?mode=hiring' },
    { does: 'They start.', by: 'office', where: '/people?mode=setup' },
  ]),

  W('people', 'offboard', 'Somebody leaves',
    'A resignation, or a last day.',
    'Access gone, tools back, final pay right, seat not still being paid for.', ['turnover', 'contract_breach'], [
    { does: 'Tools they hold are on record.', by: 'office', where: '/jobs?tab=tools' },
    nowhere('office', 'One last-day list: close their login, get the tools and keys back, final pay, and stop billing for the seat.',
      'Every piece exists separately and nothing joins them. The two that bite are a login that still works months later, and a seat still being paid for — both are things a business only finds by accident.'),
  ]),

  /* ── Safety and compliance ─────────────────────────────────────────────────────────────────── */

  W('safe', 'hazard', 'Report a hazard',
    'Somebody sees something that could hurt the next person.',
    'On the safety register with an owner and a date.', ['near_miss', 'safety_actions', 'corrective'], [
    { does: 'Reported from the job on the phone, not on a form back at the office.', by: 'field', where: '/tech-day' },
    { does: 'It lands straight on the safety register.', by: 'spec', where: '/safety?tab=hazards' },
    { does: 'A corrective action with an owner and a review date.', by: 'office', where: '/safety?tab=hazards' },
  ]),

  W('safe', 'near-miss', 'Report a near miss',
    'It nearly happened.',
    'Recorded and acted on, the same as if it had.', ['near_miss', 'safety_actions'], [
    { does: 'Reported from the job on the phone.', by: 'field', where: '/tech-day' },
    { does: 'Treated as seriously as an injury, because the difference is often luck.', by: 'spec', where: '/safety?tab=hazards' },
  ]),

  W('safe', 'injury', 'Somebody is hurt',
    'An injury at work — any injury, including a plaster from the kit.',
    'The business has been told, immediately, and the steps are underway.', ['safety_incident', 'trifr', 'lti'], [
    { does: 'Reported from the phone, on the job it happened on.', by: 'field', where: '/tech-day' },
    { does: 'The alert goes up immediately. It is a breach whatever the severity, and it cannot be switched off.', by: 'spec', where: '/safety?tab=incidents' },
    { does: 'Whoever carries safety and the top of the chart are told. Not a setting.', by: 'spec', where: '/safety?tab=today' },
    { does: 'The steps to take, in order — never "investigate".', by: 'office', where: '/safety?tab=incidents' },
  ]),

  W('safe', 'notifiable', 'A serious injury',
    'Somebody is seriously hurt, or it is otherwise notifiable.',
    'The regulator has been called and the site left as it is.', ['regulatory', 'safety_incident'], [
    { does: 'The alert says this stopped being internal the moment it happened.', by: 'spec', where: '/safety?tab=incidents' },
    { does: 'Do not disturb the site. Call the regulator now.', by: 'office', where: '/safety?tab=incidents' },
  ]),

  W('safe', 'workers-comp', 'A workers’ compensation claim',
    'An injury past first aid.',
    'Claim lodged on time and the person back on suitable duties.', ['workers_comp', 'lti', 'absenteeism'], [
    { does: 'Anything past first aid starts a claim — waiting for lost time lodges late.', by: 'spec', where: '/safety?tab=incidents' },
    { does: 'Suitable duties agreed in writing before they come back.', by: 'office', where: '/safety?tab=incidents' },
    { does: 'The return-to-work case has an owner.', by: 'office', where: '/safety?tab=incidents' },
  ]),

  W('safe', 'trifr', 'Know your TRIFR',
    'A builder asks for it before letting you on site.',
    'A real number from real hours, not an estimate.', ['trifr', 'safety_incident'], [
    { does: 'Injuries from the register, hours from the timesheets — both already in SPEC.', by: 'spec', where: '/jobs?tab=time' },
    { does: 'TRIFR and LTIFR, always quoted with the hours behind them.', by: 'spec', where: '/safety?tab=today' },
    { does: 'Under about 10,000 hours SPEC says so rather than publishing a meaningless rate.', by: 'spec', where: '/safety?tab=today' },
  ]),

  W('safe', 'corrective-action', 'Close out a corrective action',
    'An action raised off a hazard, incident or inspection.',
    'Done, with a review date that came and was met.', ['corrective', 'snap_score'], [
    { does: 'Every open action with its owner.', by: 'office', where: '/safety?tab=hazards' },
    { does: 'Overdue ones are named.', by: 'spec', where: '/safety?tab=today' },
  ]),

  W('safe', 'toolbox-talk', 'Run a toolbox talk',
    'A scheduled talk.',
    'Everybody who should have been there has signed on.', ['safety_actions', 'training_done'], [
    { does: 'Crew signs on for the talk.', by: 'field', where: '/safety?tab=site' },
    { does: 'Who should be there comes from the schedule, so missing names show up on their own.', by: 'spec', where: '/safety?tab=site' },
  ]),

  W('safe', 'site-inspection', 'Inspect a site',
    'A scheduled inspection.',
    'Done, with what it found turned into actions.', ['audit', 'safety_actions'], [
    { does: 'The inspection, on the phone, on site.', by: 'field', where: '/safety?tab=site' },
    { does: 'What it found becomes corrective actions.', by: 'spec', where: '/safety?tab=hazards' },
  ]),

  W('safe', 'psychosocial', 'Somebody is not coping',
    'A psychosocial report.',
    'Acted on, without ever knowing who made it.', ['engagement', 'safety_incident'], [
    { does: 'Reported anonymously — no name is stored at all, ever.', by: 'worker', where: '/safety?tab=hazards' },
    { does: 'The business acts on the pattern, not the person.', by: 'leader', where: '/safety?tab=hazards' },
  ]),

  W('safe', 'clear-to-work', 'Nobody unclear goes out',
    'Anybody being put on a job.',
    'Either clear, or not bookable.', ['licensing', 'regulatory'], [
    { does: 'Licences, inductions and tickets decide it.', by: 'spec', where: '/safety?tab=clear' },
    { does: 'The schedule refuses somebody who is not clear.', by: 'spec', where: '/jobs?tab=schedule' },
  ]),

  W('safe', 'coc', 'Certificate of electrical compliance',
    'Electrical work that is finished.',
    'The certificate issued to the customer and lodged where the state requires.', ['regulatory', 'contract_breach', 'audit'], [
    { does: 'The job is signed off on site.', by: 'field', where: '/tech-day' },
    nowhere('field', 'Issue the certificate of compliance for the state the job is in, and keep a copy against the job.',
      'This is legally required on electrical work and differs by state. It is currently done outside SPEC, so the one document that proves the work was lawful is the one document the job does not hold.'),
  ]),

  W('safe', 'insurances', 'Keep the business’s own insurances current',
    'Public liability and workers’ compensation come up for renewal.',
    'Current, with the certificate on hand when a builder asks.', ['regulatory', 'licensing'], [
    { does: 'Every policy and document with its expiry.', by: 'office', where: '/compliance' },
    { does: 'Anything expiring is named before it bites.', by: 'spec', where: '/compliance' },
  ]),

  /* ── Getting paid ─────────────────────────────────────────────────────────────────────────── */

  W('money', 'invoice-small', 'Invoice a small job',
    'The job is signed off.',
    'Invoiced, and in the accounting system.', ['debtor_days', 'cash_flow'], [
    { does: 'Sign-off releases the invoice.', by: 'spec', where: '/jobs?tab=billing' },
    { does: 'It goes to the accounting system — SPEC does not keep a second set of books.', by: 'spec', where: '/connections' },
  ]),

  W('money', 'progress-claim', 'Claim on a big job',
    'A stage is done, or the month ends.',
    'Claimed and paid.', ['cash_flow', 'debtor_days'], [
    { does: 'Claim by amount or by stage.', by: 'office', where: '/jobs?tab=billing' },
    { does: 'Variations must be agreed before they can be claimed.', by: 'spec', where: '/jobs?tab=billing' },
  ]),

  W('money', 'retention', 'Get the retention back',
    'A builder holds retention.',
    'Released when it is due, rather than forgotten.', ['cash_flow'], [
    { does: 'Retention held shows as a running figure.', by: 'spec', where: '/jobs?tab=billing' },
    { does: 'It is released when due.', by: 'office', where: '/jobs?tab=billing' },
  ]),

  W('money', 'debtor-chase', 'Chase the money',
    'An invoice goes past its terms.',
    'Paid, with every chase recorded so the same one never goes twice.', ['debtor_days', 'cash_flow'], [
    { does: 'Reminders at 7, 14 and 30 days.', by: 'spec', where: '/jobs?tab=billing' },
    { does: 'Each one recorded.', by: 'spec', where: '/jobs?tab=billing' },
  ]),

  W('money', 'job-costing', 'Did the job make money',
    'A job with labour, materials and variations on it.',
    'The real margin, while there is still time to do something.', ['gross_profit', 'budget_miss'], [
    { does: 'Labour, materials and variations land on the job live.', by: 'spec', where: '/jobs?tab=pipeline' },
    { does: 'A margin below the benchmark says so on the board, not at invoicing.', by: 'spec', where: '/jobs?tab=wip' },
    { does: 'Margin at risk outranks a billing gap, and asks for a variation.', by: 'spec', where: '/jobs?tab=wip' },
  ]),

  W('money', 'cashflow', 'Will there be enough money',
    'Looking at the weeks ahead.',
    'A running balance, and a warning before it goes under the buffer.', ['cash_flow'], [
    { does: 'Money in and money out, as a running balance forward.', by: 'spec', where: '/jobs?tab=cash' },
    { does: 'The buffer is the business’s own number, not one SPEC invented.', by: 'office', where: '/jobs?tab=cash' },
  ]),

  W('money', 'payroll-run', 'Run the pay',
    'The pay period ends.',
    'Paid right, with the check done before the run rather than after.', ['regulatory', 'budget_miss'], [
    { does: 'Approved hours.', by: 'office', where: '/jobs?tab=time' },
    { does: 'Checked against award rates, levels and allowances BEFORE it goes.', by: 'spec', where: '/people?mode=pay' },
    { does: 'What the check found is kept as written.', by: 'spec', where: '/people?mode=pay' },
  ]),

  W('money', 'reviews-ask', 'Ask for a review',
    'A job finished well.',
    'Asked — every customer, with no filtering.', ['revenue_growth'], [
    { does: 'The ask goes to every customer. There is no branch on how happy they seemed.', by: 'office', where: '/jobs?tab=reviews' },
    { does: 'Asked once, and recorded so it is not asked twice.', by: 'spec', where: '/jobs?tab=reviews' },
  ]),

  /* ── Running the business ─────────────────────────────────────────────────────────────────── */

  W('run', 'weekly-meeting', 'The weekly meeting',
    'The same time every week.',
    'Decisions made and written down, not a discussion that repeats next week.', ['snap_score', 'engagement'], [
    { does: 'The agenda is the numbers, already there.', by: 'spec', where: '/meeting' },
    { does: 'Decisions are recorded against who made them.', by: 'leader', where: '/board' },
  ]),

  W('run', 'monthly-scorecard', 'Score the month',
    'The month ends.',
    'Every role scored, and the scores are what reviews and Aces read from.', ['engagement', 'dev_plans', 'snap_score'], [
    { does: 'Each role scored against what it holds.', by: 'leader', where: '/scoring' },
    { does: 'Approvals go through the inbox.', by: 'leader', where: '/inbox' },
    { does: 'A run of months is what makes somebody an Ace — never the live month.', by: 'spec', where: '/jobs?tab=jobace' },
  ]),

  W('run', 'org-chart', 'Who does what',
    'The business grows, or somebody moves.',
    'A chart where every role has a name and what it is measured on.', ['dev_plans', 'turnover'], [
    { does: 'Paste the structure in, or bring it from a document.', by: 'office', where: '/org' },
    { does: 'Each seat carries its KPIs.', by: 'office', where: '/org' },
  ]),

  W('run', 'board-pack', 'The board pack',
    'The board meets.',
    'One pack, built from what already happened.', ['net_margin', 'revenue_budget'], [
    { does: 'Built from the months already scored.', by: 'spec', where: '/board' },
  ]),

  W('run', 'automation-review', 'What should be automated',
    'Roles broken into tasks.',
    'A queue of things worth building, in order.', ['productivity', 'snap_score'], [
    { does: 'Tasks scored and sorted.', by: 'office', where: '/org/automation' },
    { does: 'Approved, parked or rejected into a build queue.', by: 'leader', where: '/org/automation' },
  ]),

  W('run', 'connect-system', 'Connect the system you already run',
    'A business arriving with simPRO, or a CRM, or a payroll system.',
    'Its data is inside SPEC, as SPEC’s own rows.', ['productivity'], [
    { does: 'Connect it by category — never by vendor.', by: 'office', where: '/connections' },
    { does: 'It writes rows SPEC owns, on a schedule. No screen reads it live.', by: 'spec', where: '/jobs?tab=pipeline' },
  ]),

  W('run', 'switch-it-off', 'Turn the old system off',
    'The business decides it no longer needs what it came with.',
    'Everything keeps working. Only new rows stop arriving.', ['net_margin', 'productivity'], [
    { does: 'See how much is already SPEC’s own — jobs, quotes, timesheets.', by: 'office', where: '/connections' },
    { does: 'Turn it off. The rows stay; they just stop being refreshed, and the screen says so honestly.', by: 'office', where: '/connections' },
    { does: 'The ledger is the exception: SPEC reads it and never replaces it.', by: 'spec', where: '/connections' },
  ]),
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Derived — never stored
 * ───────────────────────────────────────────────────────────────────────────── */

export type State = 'whole' | 'partial';

/**
 * Whole or partial, worked out from the steps.
 *
 * There is deliberately no way to declare this. A stored status is a claim, and a claim nobody
 * checks quietly stops being true — usually the week after somebody renames a screen.
 */
export const stateOf = (w: Workflow): State =>
  w.steps.some(s => s.where === null) ? 'partial' : 'whole';

/** Every missing step, with the workflow it belongs to. The list worth acting on. */
export function gaps(list: readonly Workflow[] = WORKFLOWS): { workflow: Workflow; step: Step }[] {
  return list.flatMap(w => w.steps.filter(s => s.where === null).map(step => ({ workflow: w, step })));
}

export const inFamily = (family: FamilyKey, list: readonly Workflow[] = WORKFLOWS): Workflow[] =>
  list.filter(w => w.family === family);

export interface Tally { total: number; whole: number; partial: number }

export function tally(list: readonly Workflow[] = WORKFLOWS): Tally {
  const whole = list.filter(w => stateOf(w) === 'whole').length;
  return { total: list.length, whole, partial: list.length - whole };
}

/**
 * The count said out loud, including the bad half.
 *
 * Saying only the good number is how a readiness page becomes decoration. If a business reads this
 * and cannot see what is missing, the page has cost them something rather than told them anything.
 */
export function tallyLine(t: Tally = tally()): string {
  if (t.partial === 0) return `${t.total} workflows, all of them end to end in SPEC.`;
  return `${t.total} workflows mapped · ${t.whole} run end to end in SPEC · ${t.partial} have a step with no home yet, named below.`;
}

/** The screens a workflow touches, in order, with duplicates removed. */
export function screensOf(w: Workflow): string[] {
  const seen = new Set<string>();
  for (const s of w.steps) if (s.where) seen.add(s.where);
  return [...seen];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Outsimple them — the rule with teeth
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * A place is a SCREEN, not a tab.
 *
 * Moving between tabs inside Jobs is staying put: it is one screen, one thing in your head, and
 * the back button still means what you expect. Being sent from Jobs to People to Safety to finish
 * one job is what makes a system annoying, and the query string is exactly the line between them.
 */
export const placeOf = (where: string): string => where.split('?')[0].split('#')[0];

/** Where a given person has to go to play their part. `spec` is not a person, so it never counts. */
export function placesFor(w: Workflow, who: Actor): string[] {
  if (who === 'spec') return [];
  const seen = new Set<string>();
  for (const s of w.steps) if (s.by === who && s.where) seen.add(placeOf(s.where));
  return [...seen];
}

/** Everybody a workflow asks something of — SPEC excluded, because it is not asking anybody. */
export const peopleIn = (w: Workflow): Actor[] =>
  [...new Set(w.steps.map(s => s.by))].filter(a => a !== 'spec');

/**
 * The ceiling. One person, one place, one workflow.
 *
 * Set at one on purpose. Two is where it starts: the job is raised on one screen and scheduled on
 * another, and a year later booking a job is a six-screen ritual that a new starter has to be
 * taught. Nobody ever decided that would happen — it happened one reasonable step at a time, and
 * this is the line that makes each of those steps an argument somebody has to win.
 */
export const MOST_PLACES = 1;

export interface TooFar {
  workflow: Workflow;
  who: Actor;
  places: string[];
}

/** Every workflow that sends somebody somewhere else to finish what they started. */
export function tooFar(list: readonly Workflow[] = WORKFLOWS): TooFar[] {
  const found: TooFar[] = [];
  for (const w of list) {
    for (const who of peopleIn(w)) {
      const places = placesFor(w, who);
      if (places.length > MOST_PLACES) found.push({ workflow: w, who, places });
    }
  }
  return found;
}

/**
 * How much of a workflow happens without anybody doing anything.
 *
 * The number that actually separates SPEC from what Kris walked away from. Two systems can both
 * "do" a workflow; the one where four of the six steps happen by themselves is the one a business
 * does not have to train people to remember.
 */
export function doneForYou(w: Workflow): { auto: number; of: number } {
  return { auto: w.steps.filter(s => s.by === 'spec').length, of: w.steps.length };
}

export function effortLine(w: Workflow): string {
  const { auto, of } = doneForYou(w);
  const people = peopleIn(w).length;
  if (auto === of) return 'Nobody has to do anything — SPEC runs all of it.';
  const whos = people === 1 ? 'one person, one screen' : `${people} people, one screen each`;
  return auto === 0
    ? `${whos}.`
    : `${whos} · ${auto} of ${of} steps happen on their own.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Every workflow moves the meter — and every measure has a workflow
 * ───────────────────────────────────────────────────────────────────────────── */

/** The workflows that shift a given measure. What a business DOES about a bad number. */
export const movedBy = (slot: SlotId, list: readonly Workflow[] = WORKFLOWS): Workflow[] =>
  list.filter(w => w.moves.includes(slot));

/**
 * Measures nothing in the product improves.
 *
 * The check worth having. A meter is allowed to tell a business bad news; it is not allowed to
 * tell a business bad news it has no way to act on. Anything named here is a number that makes
 * somebody feel worse on Monday and gives them nothing to do on Tuesday, and that is how a
 * dashboard turns into wallpaper people stop reading.
 */
export const unreachable = (list: readonly Workflow[] = WORKFLOWS): SlotId[] =>
  FRAMEWORK.map(s => s.id).filter(id => movedBy(id, list).length === 0);

/** Workflows that move nothing — busywork, or a measure the business is not keeping. */
export const movesNothing = (list: readonly Workflow[] = WORKFLOWS): Workflow[] =>
  list.filter(w => w.moves.length === 0);

/** Said plainly, for a page: what doing this well is worth. */
export function movesLine(w: Workflow): string {
  const names = w.moves
    .map(id => FRAMEWORK.find(s => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return 'Moves nothing on the meter.';
  if (names.length === 1) return `Doing this well moves ${names[0]}.`;
  return `Doing this well moves ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}
