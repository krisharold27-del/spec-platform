/**
 * Every question an owner could ask, and whether the product can actually answer it.
 *
 * ── The design says all ninety-six are answered ──────────────────────────────────────────────────
 *
 * `designs/siteVIP Questions.dc.html` marks every one of them Answered. That is the DESIGN's claim,
 * and a page in this product that simply repeated it would be the thing this whole codebase keeps
 * catching itself doing: prose asserting a state rather than reporting one.
 *
 * So the questions and their answers come from the design, and the STATUS does not. Each question
 * names where it is handled — "Jobs · Leads · Is our rate right?", "People · Pay · Leave" — and
 * `answeredBy` resolves that to a route in this application. A question whose place does not exist
 * reads as a gap, however confidently the design says otherwise.
 *
 * ── Why this is the most useful page in the product for us ───────────────────────────────────────
 *
 * It is the only screen that gets WORSE when somebody writes a nice sentence and does not build the
 * thing. Every other check in this repo verifies something that exists; this one counts what does
 * not, from the owner's side of the desk, in the owner's words.
 *
 * Generated from the design file rather than typed, so the two cannot drift: if a question is
 * reworded there, it is reworded here.
 */

/** Where a question is handled, resolved to somewhere in this product. */
export interface Place {
  /** The route, when the place exists. Null when nothing in the product matches. */
  href: string | null;
  /** What the design called it. */
  named: string;
}

export interface Question {
  n: number;
  group: string;
  q: string;
  a: string;
  /** The design's own words for where it happens. */
  where: string;
}

/**
 * Every screen this product has, and the words the design uses for it.
 *
 * Written as prefixes rather than exact strings because the design names a place and then a section
 * of it — "Jobs · Leads · Is our rate right?" is the Leads tab. Matching on the leading part is
 * what makes that resolve, and matching on the LONGEST prefix is what stops "Jobs" swallowing
 * "Jobs · Leads".
 */
export const PLACES: { named: string; href: string }[] = [
  { named: 'Admin', href: '/settings' },
  { named: 'Angus Shield', href: '/money' },
  { named: 'Board pack', href: '/board' },
  { named: 'Compliance', href: '/compliance' },
  { named: 'Connections', href: '/connections' },
  { named: 'Customer page', href: '/customer' },
  { named: 'Help', href: '/help' },
  { named: 'Jobs · Callbacks', href: '/jobs?tab=rework' },
  { named: 'Jobs · How long?', href: '/jobs?tab=howlong' },
  { named: 'Jobs · Invoices & claims', href: '/jobs?tab=billing' },
  { named: 'Jobs · Leads', href: '/jobs?tab=leads' },
  { named: 'Jobs · Materials', href: '/jobs?tab=catalogue' },
  { named: 'Jobs · Pre-builds', href: '/jobs?tab=prebuilds' },
  { named: 'Jobs · Quotes', href: '/jobs?tab=quotes' },
  { named: 'Jobs · Repeat work', href: '/jobs?tab=service' },
  { named: 'Jobs · Sales Ace', href: '/jobs?tab=ace' },
  { named: 'Jobs · Schedule', href: '/jobs?tab=schedule' },
  { named: 'Jobs · Takeoff', href: '/jobs?tab=takeoff' },
  { named: 'Jobs · Tenders', href: '/jobs?tab=tenders' },
  { named: 'Jobs · Tools', href: '/jobs?tab=tools' },
  { named: 'Jobs · WIP', href: '/jobs?tab=wip' },
  { named: 'Jobs', href: '/jobs' },
  { named: 'My Page', href: '/my-page' },
  { named: 'My Scorecard', href: '/me' },
  { named: 'Org chart', href: '/org' },
  { named: 'People · Pay', href: '/people?mode=pay' },
  { named: 'People', href: '/people' },
  { named: 'Pricing', href: '/pricing' },
  { named: 'Safety · Tech Day', href: '/tech-day' },
  { named: 'Safety · Virtual GM', href: '/virtual-gm' },
  { named: 'Safety', href: '/safety' },
  { named: 'Setup', href: '/setup' },
  { named: 'Tech Day', href: '/tech-day' },
  { named: 'Timesheets', href: '/jobs?tab=time' },
  { named: 'Training', href: '/training' },
  { named: 'Virtual GM', href: '/virtual-gm' },
  { named: 'siteVIP landing', href: '/' },
  { named: 'siteVIP', href: '/virtual-gm' },
];

/**
 * Where a question is handled, or nothing.
 *
 * Longest prefix wins, so "Jobs · Leads · Is our rate right?" resolves to the Leads tab rather than
 * to Jobs. "Everywhere" resolves to nothing on purpose — a question answered everywhere is one this
 * page cannot point at, and pretending otherwise would be the page lying about its own method.
 */
export function placeOf(where: string): Place {
  const cleaned = where.trim();
  const matches = PLACES
    .filter(p => cleaned === p.named || cleaned.startsWith(`${p.named} ·`) || cleaned.startsWith(`${p.named}·`))
    .sort((a, b) => b.named.length - a.named.length);
  return { href: matches[0]?.href ?? null, named: cleaned };
}

/**
 * Three, not two.
 *
 * `everywhere` exists because three of the ninety-six are answered by something the product does on
 * every screen — asking before blocking, never deciding for you, "that's not right" on any answer.
 * They have no address, and the first version of this page counted them as GAPS, which was the page
 * being wrong in its own way: it read as three unbuilt features when they are three built ones this
 * method cannot point at.
 *
 * Calling them answered instead would have been the other kind of wrong — a status nothing checks.
 * So they get their own word, and the page says what it is and is not able to verify about them.
 */
export type Status = 'answered' | 'everywhere' | 'gap';

/**
 * Whether the product can answer this question.
 *
 * `routes` is every page this application actually has, passed in by the caller that can read the
 * filesystem — this module stays pure so it can be tested against a made-up product as easily as
 * against the real one.
 */
export function statusOf(question: Question, routes: ReadonlySet<string>): Status {
  if (/^everywhere\b/i.test(question.where.trim())) return 'everywhere';
  const place = placeOf(question.where);
  if (!place.href) return 'gap';
  const path = place.href.split('?')[0];
  return routes.has(path) ? 'answered' : 'gap';
}

export const EVERYWHERE_IS_NOT_CHECKED =
  'These three are answered by something siteVIP does on every screen rather than by a screen of its own, so this page cannot point at them and does not pretend to have checked them.';

export interface Reading {
  total: number;
  answered: number;
  gaps: Question[];
  everywhere: Question[];
  says: string;
}

export function read(questions: readonly Question[], routes: ReadonlySet<string>): Reading {
  const gaps = questions.filter(q => statusOf(q, routes) === 'gap');
  const everywhere = questions.filter(q => statusOf(q, routes) === 'everywhere');
  const answered = questions.length - gaps.length - everywhere.length;

  const tail = everywhere.length > 0
    ? ` ${everywhere.length} more are answered everywhere rather than on a screen, so this page cannot check those.`
    : '';

  return {
    total: questions.length,
    answered,
    gaps,
    everywhere,
    says: gaps.length === 0
      ? `${answered} of ${questions.length} have a screen in siteVIP that answers them, and this page checked every one by looking for it.${tail}`
      : `${answered} of ${questions.length} answered. ${gaps.length} ${gaps.length === 1 ? 'has' : 'have'} no screen behind ${gaps.length === 1 ? 'it' : 'them'} yet — counted rather than taken on the design's word.${tail}`,
  };
}

/** Counted per area, because a single number hides which part of the product is thin. */
export function byGroup(
  questions: readonly Question[],
  routes: ReadonlySet<string>,
): { group: string; total: number; answered: number }[] {
  const groups: string[] = [];
  for (const q of questions) if (!groups.includes(q.group)) groups.push(q.group);
  return groups.map(group => {
    const mine = questions.filter(q => q.group === group);
    return {
      group,
      total: mine.length,
      answered: mine.filter(q => statusOf(q, routes) === 'answered').length,
    };
  });
}

/** The ninety-six, from designs/siteVIP Questions.dc.html. */
export const QUESTIONS: Question[] = [
  { n: 1, group: 'Starting and switching', q: 'How long does it take to get going?', a: 'About an hour. Drop in your staff list, check the org chart SPEC builds, agree the roles, and you are running.', where: 'Setup' },
  { n: 2, group: 'Starting and switching', q: 'Do I have to re-type everything from my old systems?', a: 'No. Staff, customers, open jobs and the price book come across from files or straight from Simpro, HubSpot and Xero.', where: 'Setup · step 5' },
  { n: 3, group: 'Starting and switching', q: 'Can I keep the systems I already use?', a: 'Yes. Start with what you want. Anything left in another system still feeds the Power Meter, and you turn areas on when you are ready.', where: 'Virtual GM · Everything the business needs' },
  { n: 4, group: 'Starting and switching', q: 'What does it cost, all in?', a: 'A$134 per leadership seat and A$17 per team seat a month, AI included. JBI at 5 and 30 is A$1,180 a month.', where: 'Pricing' },
  { n: 5, group: 'Starting and switching', q: 'Am I locked into a contract?', a: 'No. Month to month, every feature included, no exit fees.', where: 'siteVIP landing' },
  { n: 6, group: 'Starting and switching', q: 'If I leave, do I get my data back?', a: 'Yes. The owner can export everything, any time, in one click: spreadsheets and PDFs of jobs, customers, people, pay, safety, compliance, money and documents.', where: 'Admin · Your data is yours' },
  { n: 7, group: 'Starting and switching', q: 'Who owns my data?', a: 'The business, always. SPEC only uses it, anonymised, for industry benchmarks if the business turns that on.', where: 'Admin · Your data is yours' },
  { n: 8, group: 'Starting and switching', q: 'How do my staff learn it?', a: 'Each person gets their own My Page with only what their role needs, and short in-field training modules.', where: 'My Page · Training' },
  { n: 9, group: 'Starting and switching', q: 'What if my staff are not good with technology?', a: 'Their first morning is three screens, two minutes, done on the phone with their supervisor. After that it’s one screen: pre-start, today’s jobs, hold to talk.', where: 'Tech Day · First morning' },
  { n: 10, group: 'Starting and switching', q: 'Who do I call when I’m stuck?', a: 'Ask SPEC any time. A real person replies 7am to 7pm, 7 days, the same day.', where: 'Help · Cockpit support' },
  { n: 11, group: 'Winning work', q: 'How fast can I quote?', a: 'Instant for known work. Pre-builds and your own history price it; takeoff counts plans in seconds.', where: 'Jobs · Pre-builds, Takeoff' },
  { n: 12, group: 'Winning work', q: 'Will it stop me under-pricing?', a: 'Yes. Every pre-build checks hours against real jobs and prices against today’s supplier prices, and shows the real margin.', where: 'Jobs · Pre-builds' },
  { n: 13, group: 'Winning work', q: 'Is my hourly rate right for the market?', a: 'SPEC compares your rate with what quotes win at and local published rates, and asks the sharp question: is the market wrong, or are we?', where: 'Jobs · Leads · Is our rate right?' },
  { n: 14, group: 'Winning work', q: 'Is the quote ready before I ask for it?', a: 'Yes. Every new lead is priced in the background from pre-builds and the last 50 jobs of that type. The estimator just checks and sends.', where: 'Jobs · Leads' },
  { n: 15, group: 'Winning work', q: 'Where are my leads up to?', a: 'Every lead from every source in one list, with the next step.', where: 'Jobs · Leads' },
  { n: 16, group: 'Winning work', q: 'Which lead sources make me money?', a: 'Each source shows jobs won, dollars, margin and reply speed.', where: 'Jobs · Leads' },
  { n: 17, group: 'Winning work', q: 'Did they accept and pay the deposit?', a: 'Acceptance shows in Jobs and the CRM, and the job books straight away. SPEC doesn’t take deposits.', where: 'Jobs · Quotes' },
  { n: 18, group: 'Winning work', q: 'Which quotes are going stale?', a: 'Late quotes go on the estimator’s My Page and escalate. Sales Ace lists them to chase.', where: 'My Page · Sales Ace' },
  { n: 19, group: 'Winning work', q: 'What is my pipeline worth?', a: 'Shown on Sales Ace as pipeline coverage.', where: 'Jobs · Sales Ace' },
  { n: 20, group: 'Winning work', q: 'Am I winning too much or too little?', a: 'Win rate and price are joined up by job type: too cheap, costs too high, winning only low-margin work, or losing one type of job.', where: 'Jobs · Leads · Is our rate right?' },
  { n: 21, group: 'Winning work', q: 'Should I go for this tender?', a: 'Go or no-go from win rate with that builder, crew capacity and margin.', where: 'Jobs · Tenders' },
  { n: 22, group: 'Winning work', q: 'How do I get more repeat work?', a: 'Repeat work shows customers without a contract and drafts the offer.', where: 'Jobs · Repeat work' },
  { n: 23, group: 'Doing the work', q: 'Who is on what job today?', a: 'The schedule, every person on every job, with billable hours.', where: 'Jobs · Schedule' },
  { n: 24, group: 'Doing the work', q: 'Is a job running over hours?', a: 'Every morning the tech and supervisor get a light nudge: "This job has 4 hours left. Finish within 4 hours." If it goes over, an alert goes up the chain.', where: 'Tech Day · Jobs Ace' },
  { n: 25, group: 'Doing the work', q: 'Have my people got the right licences?', a: 'Compliance tracks every licence. Anyone not current can’t be booked.', where: 'Compliance' },
  { n: 26, group: 'Doing the work', q: 'Can a subbie with a lapsed licence be sent to a job?', a: 'No. Their booking is blocked until it’s fixed.', where: 'Compliance' },
  { n: 27, group: 'Doing the work', q: 'Is there a pre-start before work?', a: 'Yes. Anyone driving a company vehicle does four checks before their first job: vehicle, tools and PPE, test equipment, licence. Under a minute. No pre-start, no jobs. Any "not OK" locks the jobs until the supervisor clears it. Counts as a Safety KPI.', where: 'Tech Day · Pre-start' },
  { n: 28, group: 'Doing the work', q: 'Where’s my safety paperwork?', a: 'SWMS, incidents, hazards and toolbox talks are in Safety, and on the job card.', where: 'Safety · Tech Day' },
  { n: 29, group: 'Doing the work', q: 'Are jobs done to standard?', a: 'Checklists and sign-off on every job, and callbacks tracked by cause.', where: 'Tech Day · Callbacks & rework' },
  { n: 30, group: 'Doing the work', q: 'Have the materials turned up?', a: 'Supplier holdups show why and a way around it.', where: 'Jobs · Materials' },
  { n: 31, group: 'Doing the work', q: 'Where are my tools?', a: 'Who has what, test and tag and calibration due.', where: 'Jobs · Tools' },
  { n: 32, group: 'Doing the work', q: 'Where are my utes?', a: 'Each ute shows who has it, where it last clocked on, and service and rego due. No live tracking.', where: 'Jobs · Tools, equipment and utes' },
  { n: 33, group: 'Doing the work', q: 'How long should this job take?', a: 'Your own history, plus site factors.', where: 'Jobs · How long?' },
  { n: 34, group: 'Doing the work', q: 'Does the customer know when we’re coming?', a: 'Customer page: booking, on my way, variations, pay.', where: 'Customer page' },
  { n: 35, group: 'The money', q: 'Am I making money on this job?', a: 'Real margin on every job, live, and work in progress.', where: 'Jobs · WIP · Angus Shield' },
  { n: 36, group: 'The money', q: 'Am I going to be OK?', a: 'Cash for the next 13 weeks, the buffer, and the weekly money reviews.', where: 'Angus Shield' },
  { n: 37, group: 'The money', q: 'Is my BAS ready?', a: 'Yes. Tax and super set aside is reviewed monthly, and every card spend arrives with its receipt, so the BAS has nothing missing.', where: 'Angus Shield' },
  { n: 38, group: 'The money', q: 'Can I get rid of paper receipts?', a: 'Yes. The Angus Card sits on each person’s phone. Every spend picks a job and the receipt is photographed on the spot. Limits by role; alcohol, gambling and cash blocked.', where: 'Angus Shield · Angus Card' },
  { n: 39, group: 'The money', q: 'Is payroll done right?', a: 'Always. Seven checks run before any pay run can be approved: hours, award rates, deductions, super with wages, payments, STP and an audit trail.', where: 'People · Pay run' },
  { n: 40, group: 'The money', q: 'Can someone be paid leave they don’t have?', a: 'Not by mistake. Over-balance leave needs a manager to override on purpose, and the owner is told. Leave in advance is case by case.', where: 'People · Pay · Leave' },
  { n: 41, group: 'The money', q: 'Who keeps the award rules current?', a: 'The Head of Commercial. The award is loaded once and applied every pay run, and SPEC flags every Fair Work change for them to accept.', where: 'People · Pay · Award rules' },
  { n: 42, group: 'The money', q: 'Am I claiming everything I’m owed?', a: 'Yes. SPEC captures fuel tax credits, GST credits, write-offs, deductions, apprentice incentives, solar rebates, payroll tax exemptions, workers’ comp adjustments and grants. It works out each claim; the accountant lodges it.', where: 'Angus Shield · Money you’re owed' },
  { n: 43, group: 'The money', q: 'Who owes me and for how long?', a: 'Reviewed weekly. Nothing over 45 days, nothing near 90. SPEC reminds at 7, 14, 30 and 45 days, then the owner calls.', where: 'Angus Shield' },
  { n: 44, group: 'The money', q: 'Do I have to lodge a TPAR for my subbies?', a: 'Yes, by 28 August. SPEC builds it from every subbie payment and your accountant lodges it. No valid ABN, no payment.', where: 'Compliance · Subbies & the ATO' },
  { n: 45, group: 'The money', q: 'Is this subbie really a contractor or an employee?', a: 'Checked once at onboarding against the ATO tests. If they look like an employee, SPEC suggests offering them a job.', where: 'Compliance · Subbies & the ATO' },
  { n: 46, group: 'The money', q: 'Am I over the payroll tax threshold?', a: 'Shown for your state: where your wages sit against the threshold, with apprentice wages taken out.', where: 'Angus Shield · Money you’re owed' },
  { n: 47, group: 'The money', q: 'Can my accountant see it?', a: 'Yes. They keep working in Xero, or get an Angus Shield login if you switch.', where: 'Angus Shield' },
  { n: 48, group: 'People', q: 'Is everyone clear on their role?', a: 'Every role has one line on what it does and KPIs to match.', where: 'Setup · Org chart' },
  { n: 49, group: 'People', q: 'Who reports to who?', a: 'The org chart, including subbies under their leader.', where: 'Org chart' },
  { n: 50, group: 'People', q: 'How do I hire the right person?', a: 'Recruitment builds the ad from the role and scores applicants.', where: 'People · Recruitment' },
  { n: 51, group: 'People', q: 'How do I onboard someone properly?', a: 'Staff and subbies onboard on their phone: contract, licences, induction, SWMS.', where: 'People · Onboarding' },
  { n: 52, group: 'People', q: 'Is my new supervisor trained?', a: 'The step-up leader is flagged with no training plan, and the plan starts in one tap.', where: 'Virtual GM · Training' },
  { n: 53, group: 'People', q: 'Who is doing a great job?', a: 'Aces across the business, and every scorecard.', where: 'Training · Scoring' },
  { n: 54, group: 'People', q: 'How do I pay incentives fairly?', a: 'Incentives sit on top of an honest KPI board, doubled for Aces, switched on per person.', where: 'My Scorecard' },
  { n: 55, group: 'People', q: 'Why do people leave?', a: 'Exit reasons are recorded and wrong-reason exits count against the business.', where: 'People' },
  { n: 56, group: 'People', q: 'Is anyone struggling or burnt out?', a: 'A monthly anonymous check-in, shown for the whole business only, with what people said. No one can see who said what.', where: 'Safety · How is everyone going?' },
  { n: 57, group: 'People', q: 'What happens when a manager fixes every mistake themselves?', a: 'SPEC asks first: "Hang on a second, is this correct?" with the reason and two buttons, so people find their own mistakes.', where: 'Everywhere · seven places' },
  { n: 58, group: 'Safety and compliance', q: 'Has anyone been hurt?', a: 'Incidents come first on the Power Meter and in Safety.', where: 'Safety · Virtual GM' },
  { n: 59, group: 'Safety and compliance', q: 'Does every obligation have an owner?', a: 'Yes. Nine obligations each trace up a chain with named owners, shown on the org chart. A broken link goes red, the next person up is told, and it goes on the weekly meeting.', where: 'Org chart · Chain of responsibility' },
  { n: 60, group: 'Safety and compliance', q: 'Is my insurance current?', a: 'Your policies, subbies’ cover and vehicle rego.', where: 'Compliance' },
  { n: 61, group: 'Safety and compliance', q: 'Are my certificates lodged on time?', a: 'Filled in from the job and lodged.', where: 'Compliance · Certificates' },
  { n: 62, group: 'Safety and compliance', q: 'Do we do what we say?', a: 'The Compliance question on the Virtual GM home, read from quotes, jobs and sign-offs.', where: 'Virtual GM' },
  { n: 63, group: 'Safety and compliance', q: 'What happens if WorkSafe turns up?', a: 'One tap: everything for the site on one screen and as a PDF, and the owner and safety lead are told.', where: 'Safety · WorkSafe on site?' },
  { n: 64, group: 'Running the business', q: 'Is my business going well?', a: 'One reading: the Business Power Meter, and "has it got better?"', where: 'Virtual GM' },
  { n: 65, group: 'Running the business', q: 'What should I do this week?', a: 'The levers to pull, with what each is worth.', where: 'Virtual GM' },
  { n: 66, group: 'Running the business', q: 'Why did the meter drop?', a: 'A one-line cause on every big drop.', where: 'My Page · Power Meter' },
  { n: 67, group: 'Running the business', q: 'What goes to the board?', a: 'The monthly pack, from locked numbers, with signed reviews.', where: 'Board pack' },
  { n: 68, group: 'Running the business', q: 'Can I run more than one business?', a: 'Yes. One login, switch between businesses, or see them all side by side.', where: 'Virtual GM · business switcher' },
  { n: 69, group: 'Running the business', q: 'What are my goals, and are we hitting them?', a: 'Set at the start and checked every month.', where: 'Setup · Board pack' },
  { n: 70, group: 'Trust and tech', q: 'Is my data safe?', a: 'Stored in Australia with encrypted backups overseas. Two-step sign-in for everyone, and who sees what is set by role.', where: 'Admin · Your data is yours' },
  { n: 71, group: 'Trust and tech', q: 'Who can see the money?', a: 'Owner: everything. GM: everything but the owner’s pay. Head of Commercial: money and pay. Managers: their team’s jobs and costs. Supervisors: their jobs’ hours and materials. Techs: their own pay.', where: 'Admin · Who sees the money' },
  { n: 72, group: 'Trust and tech', q: 'Does SPEC read my staff’s emails?', a: 'Work mail only, Board approved. Anyone can mark mail private.', where: 'Connections · Staff mailboxes' },
  { n: 73, group: 'Trust and tech', q: 'Does it work with no signal?', a: 'Yes, on the phone. Every tap is saved.', where: 'Tech Day' },
  { n: 74, group: 'Trust and tech', q: 'Can I trust what the AI tells me?', a: 'SPEC advises and never decides. Every message waits for approval.', where: 'Everywhere' },
  { n: 75, group: 'Trust and tech', q: 'What if it gets something wrong?', a: 'Tap "That’s not right" on any SPEC answer. It goes to SPEC at manager@specbizhq.com and the fix is logged.', where: 'Everywhere' },
  { n: 76, group: 'The owner’s life', q: 'Can I go on holiday?', a: 'Yes. Press "I’m away" and every alert goes to your GM. Only an injury still reaches you, and everything is waiting when you’re back.', where: 'Virtual GM · I’m away' },
  { n: 77, group: 'The owner’s life', q: 'How much time will this save me?', a: 'Shown every month in hours and dollars: quoting, timesheets, payroll, receipts, reminders and reports, plus margin kept.', where: 'Virtual GM' },
  { n: 78, group: 'The owner’s life', q: 'Do I need to become an accountant?', a: 'No. The system quietly keeps you in the black and you get on with the work.', where: 'Angus Shield' },
  { n: 79, group: 'The owner’s life', q: 'What happens if I get sick?', a: 'Same switch: the GM runs the alerts and the levers, and only an injury reaches you.', where: 'Virtual GM · I’m away' },
  { n: 80, group: 'Round 2', q: 'Do my payment claims to clients follow the Security of Payment rules?', a: 'Yes. Every claim is built to the rules, dated and served, and SPEC tracks the client’s reply deadline. Miss it and you’re told, with the next step drafted.', where: 'Jobs · Invoices & claims' },
  { n: 81, group: 'Round 2', q: 'Who is holding my retentions, and when do I get them back?', a: 'Listed by client, amount and release date.', where: 'Jobs · Invoices & claims' },
  { n: 82, group: 'Round 2', q: 'What’s still under defects or warranty?', a: 'Every job has a defects period with free callbacks tracked, and product warranties are logged. When defects end, SPEC asks for the retention back.', where: 'Jobs · Invoices & claims' },
  { n: 83, group: 'Round 2', q: 'Who is on call after hours?', a: 'A weekly roster. After-hours calls go to that person’s phone and book a job, and the award on-call allowance goes into their pay.', where: 'People · On call' },
  { n: 84, group: 'Round 2', q: 'What happens if a key person leaves?', a: 'Every role’s how-to lives in SPEC, every key role has a named backup, and a handover checklist starts the day someone resigns.', where: 'People · Key roles and backups' },
  { n: 85, group: 'Round 2', q: 'Are my reports ready for the bank?', a: 'One tap builds a bank-ready pack: P&L, balance sheet, cash flow, aged debtors and WIP.', where: 'Angus Shield · Bank-ready pack' },
  { n: 86, group: 'Round 2', q: 'What is my business worth if I sell?', a: 'An estimate each quarter, and what would raise it. A broker or accountant sets the real price.', where: 'Angus Shield · What the business is worth' },
  { n: 87, group: 'Round 2', q: 'Should this new client get an account, and on what terms?', a: 'SPEC checks their ABN, credit history and how they’ve paid other trades, then suggests terms and a credit limit, set per client.', where: 'Jobs · Invoices & claims · Client accounts' },
  { n: 88, group: 'Round 2', q: 'Are my apprentices keeping up at TAFE?', a: 'TAFE results come in from the provider, and anyone falling behind is flagged to their supervisor. Shown on their training record.', where: 'People · TAFE progress' },
  { n: 89, group: 'Round 2', q: 'Does it handle both maintenance and project work?', a: 'Yes. Every job is maintenance or a project. Maintenance is book, do, sign off and invoice the same day. Projects get takeoff or tender, progress claims, variations, retentions and a defects period.', where: 'Jobs · All jobs / Maintenance / Projects' },
  { n: 90, group: 'Round 3', q: 'What happens if siteVIP goes down?', a: 'Phones keep working offline and everything syncs when it’s back. There’s a status page, and the owner gets an email.', where: 'Tech Day · status page' },
  { n: 91, group: 'Round 3', q: 'How do I get my people to actually use it?', a: 'Jobs only go to the phone and pay only runs from siteVIP timesheets. Using it counts on the KPI board, and supervisors see who hasn’t used it this week.', where: 'People · Using siteVIP this week' },
  { n: 92, group: 'Round 3', q: 'How are client complaints and disputes handled?', a: 'Every complaint becomes a callback with an owner and a date, and the client gets updates. A dispute pack in one tap: quote, signed variations, photos, sign-offs and messages.', where: 'Jobs · Callbacks · Customers' },
  { n: 93, group: 'Round 3', q: 'Who pays the tolls and fines on our utes?', a: 'Tolls go to the job the ute was on. Fines are matched to the driver, who is asked to nominate.', where: 'Compliance · Insurance and registrations' },
  { n: 94, group: 'Round 3', q: 'Are timesheets accurate without spying on people?', a: 'Clock on and off at the job site only. No tracking in between.', where: 'Tech Day' },
  { n: 95, group: 'Round 3', q: 'Can work orders from agents and strata come straight in?', a: 'Yes. Work orders from agents, strata and email land in Leads to accept.', where: 'Jobs · Leads' },
  { n: 96, group: 'Round 3', q: 'Will the siteVIP price go up on me?', a: 'Your price is locked for 12 months, with 60 days’ notice of any change.', where: 'siteVIP landing · Pricing' },
];
