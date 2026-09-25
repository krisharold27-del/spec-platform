/**
 * The questions people actually ask, and a straight answer to each one.
 *
 * Kris, 17 September: *"lets make an issue register expected from users - i can't login, forgot my
 * password, how do i add a person, how do i add a role, how to add a kpi, how to delete a kpi, etc
 * - go through the full list and lets make sure we have simple answwrs for them all"*.
 *
 * ── What was there before ────────────────────────────────────────────────────────────────────────
 *
 * One link, in the footer, reading "Get help", and it opened an email to manager@specbizhq.com.
 * That is not a help system; it is a queue with Kris at the end of it. At twenty businesses it is a
 * nuisance, at two hundred it is a full-time job, and at seven in the evening it is silence.
 *
 * ── Three rules this file is held to ─────────────────────────────────────────────────────────────
 *
 * 1. IT ANSWERS IN THE WORDS PEOPLE USE, not the words the product uses. Nobody types "criterion".
 *    They type "how do I delete a KPI", and `also` carries the rest of the ways they might say it.
 *
 * 2. EVERY ANSWER IS FOLLOWABLE, and proven so. `go` is a real route and `press` is the real words
 *    on the real button — both checked by `tests/help.test.ts` against the pages themselves. A help
 *    page naming a button that is not there is worse than no help page: it makes somebody doubt
 *    what they are looking at rather than doubt the instructions.
 *
 * 3. WHERE THE ANSWER IS "YOU CANNOT", IT SAYS SO. Three of these are honest refusals. Sending
 *    somebody hunting for a button SPEC has never had is the cruellest thing a help page can do.
 *
 * And it is reachable signed out, because the person who most needs help is the one who cannot get
 * in.
 */

export interface Answer {
  /** The question, in the words somebody would actually use. */
  ask: string;
  /** Other ways the same thing gets asked. What the search matches on, never displayed. */
  also?: string[];
  /** The answer. Short enough to read while stuck. */
  say: string;
  /** Where to go. Checked against the real routes. */
  go?: { href: string; label: string };
  /** The exact words on the button to look for. Checked against the real page. */
  press?: string;
  /** True when the honest answer is that SPEC does not do this. */
  cannot?: boolean;
}

export interface HelpGroup {
  title: string;
  /** Shown under the heading, so somebody can tell in one line whether their question is in here. */
  note: string;
  answers: Answer[];
}

/**
 * Ordered by when somebody hits it, not by importance.
 *
 * Getting in is first because a person who cannot sign in cannot reach anything else, and because
 * it is the only group that will be read by somebody who is already annoyed.
 */
export const HELP: HelpGroup[] = [
  {
    title: 'Getting in',
    note: 'Signing in, passwords, invitations.',
    answers: [
      {
        ask: 'I cannot sign in',
        also: ['cant login', "can't log in", 'wont let me in', 'locked out', 'password not working'],
        say:
          'Almost always the email. Use the one your invitation was sent to — not a personal address, '
          + 'and not a different work one. If the password is the problem, ask for a new one; it takes a minute. '
          + 'If SPEC says the same thing however carefully you type, check whether SPEC itself is up before you try again.',
        go: { href: '/signin', label: 'Sign in' },
        press: 'Sign in',
      },
      {
        ask: 'I forgot my password',
        also: ['reset password', 'lost password', 'new password'],
        say:
          'Ask for a link and it is emailed to you. SPEC gives the same answer whether or not the address is on the '
          + 'system, so nobody can use it to find out who is a customer — which means if no email arrives, the likely '
          + 'reason is that the address is not the one you signed up with.',
        go: { href: '/reset', label: 'Ask for a new password' },
        press: 'Email me a link',
      },
      {
        ask: 'The password email never arrived',
        also: ['no email', 'didnt get the email', 'check spam'],
        say:
          'Look in junk first — it is nearly always there. If it is not, the address you typed is probably not the '
          + 'one on your seat. Ask whoever invited you which address they used.',
        go: { href: '/reset', label: 'Try again' },
        press: 'Email me a link',
      },
      {
        ask: 'I want to change my password',
        also: ['update password', 'change password'],
        say: 'From inside SPEC, once you are signed in. Eight characters or more.',
        go: { href: '/account/password', label: 'Change your password' },
        press: 'Save password',
      },
      {
        ask: 'I was invited but the link does not work',
        also: ['invite expired', 'invitation link', 'take my seat'],
        say:
          'An invitation is single-use and belongs to one email address. If it has already been used, or you are opening '
          + 'it while signed in as somebody else, it will not work — sign out and open it again. If it is genuinely '
          + 'expired, ask for a fresh one; it costs nothing.',
        go: { href: '/signin', label: 'Sign in' },
        press: 'Sign in',
      },
      {
        ask: 'Two of us signed up and now there are two businesses',
        also: ['duplicate business', 'two accounts', 'wrong business', 'colleague signed up'],
        say:
          'This happens, and the fix is to pick one and invite everybody into it. Signing up creates a NEW business; '
          + 'joining an existing one only ever happens through an invitation. Nothing in the spare one is lost while '
          + 'you decide — ask us to clear it once you have.',
        go: { href: '/setup/business', label: 'Invite people into the one you are keeping' },
        press: 'Send invite',
      },
      {
        ask: 'Is SPEC down, or is it me?',
        also: ['is it broken', 'not working', 'site down', 'status'],
        say:
          'There is a page that says so plainly, and it does not need you to be signed in. If it says everything is '
          + 'working and you still cannot get in, the problem is your address or your password, not SPEC.',
        go: { href: '/status', label: 'Check whether SPEC is working' },
      },
    ],
  },

  {
    title: 'Your people',
    note: 'Adding somebody, taking somebody off, and what they can see.',
    answers: [
      {
        ask: 'How do I add a person?',
        also: ['add someone', 'new person', 'add staff', 'add employee', 'invite'],
        say:
          'On your business page, put their name against the role they do. That is all it takes and it costs nothing — '
          + 'the name sits on the chart straight away.',
        go: { href: '/setup/business', label: 'Your business on one page' },
        press: 'Add',
      },
      {
        ask: 'How do I give someone a login?',
        also: ['invite them', 'send invite', 'give access', 'seat'],
        say:
          'Putting a name on the chart does not send anything. Inviting them does — open "Invite them in" beside their '
          + 'name. That is also the moment a seat starts being billed, so it is deliberately a separate press from '
          + 'adding the name.',
        go: { href: '/setup/business', label: 'Your business on one page' },
        press: 'Send invite',
      },
      /*
        Rewritten on 19 September, the same hour the rights request was built.

        The old answer said "there is no switch, on purpose" and was true when it was written. It
        stopped being true the moment an administrator could grant a branch, and a help page that
        confidently describes a product that has moved on is worse than no help page — somebody
        following it concludes they are the problem rather than that the instructions are old.

        It is still not a switch, and the first paragraph is kept word for word because that part
        never changed: access follows the chart. What is new is the one case the chart cannot
        express — covering somebody else's crew for a fortnight — and it is an ASK, not a setting.
      */
      {
        ask: 'How do I change what someone can see?',
        also: ['change access', 'permissions', 'make them an admin', 'access level', 'cover for someone'],
        cannot: true,
        say:
          'There is no switch, on purpose. What somebody can see follows where they sit on the chart — move them to a '
          + 'different role and it moves with them, both ways, the same minute. For covering somebody else\u2019s crew '
          + 'while they are away, press that role on the chart and ask the administrator for rights over it. They '
          + 'decide in Approvals, and it is taken back from Company settings when the cover ends.',
        go: { href: '/org', label: 'Move them, or ask on the chart' },
      },
      {
        ask: 'Somebody has left — what do I do?',
        also: ['remove person', 'delete person', 'they left', 'took someone off'],
        say:
          'Take their name off the role. The role stays, and so does everything they scored — their history belongs to '
          + 'the business, not to their login. That is also what stops the seat being billed.',
        go: { href: '/setup/business', label: 'Your business on one page' },
        press: 'Remove',
      },
      {
        ask: 'Someone is in the wrong role',
        also: ['move someone', 'wrong role', 'changed jobs'],
        say:
          'Put their name against the right role and SPEC will ask whether you meant to move them or to merge the two '
          + 'roles. Say which; it does not guess.',
        go: { href: '/setup/business', label: 'Your business on one page' },
        press: 'Move them',
      },
    ],
  },

  {
    title: 'Roles and the chart',
    note: 'The shape of the business — who does what, and who reports to whom.',
    answers: [
      {
        ask: 'How do I add a role?',
        also: ['new role', 'add a position', 'add a job'],
        say:
          'On the chart, under whoever it reports to. A role is a JOB, not a person — "Site Supervisor", not "Dave". '
          + 'That distinction is the one thing worth getting right, because everything else in SPEC hangs off it: two '
          + 'people can do one role, and one person can do three.',
        go: { href: '/org', label: 'Org chart' },
        press: 'Add it',
      },
      {
        ask: 'How do I delete a role?',
        also: ['remove role', 'get rid of a role'],
        say:
          'On your business page. SPEC will refuse while somebody is in it or something reports to it — move those '
          + 'first. The top role cannot be deleted at all; a business has to have a top.',
        go: { href: '/setup/business', label: 'Your business on one page' },
        press: 'delete role',
      },
      {
        ask: 'I have my org chart in a spreadsheet already',
        also: ['import chart', 'paste', 'csv', 'bulk add'],
        say: 'Paste it in and SPEC will build the chart from it, rather than you typing thirty roles by hand.',
        go: { href: '/org', label: 'Org chart' },
        press: 'Build the chart',
      },
      {
        ask: 'It will not let me change the chart',
        also: ['cannot edit', 'no add button', 'greyed out'],
        say:
          'You can see the whole chart — the shape of a business is not a secret — but changing it belongs to whoever '
          + 'manages your part of it. You can never change a role above you or beside you, only your own and the ones '
          + 'beneath it.',
        go: { href: '/org', label: 'Org chart' },
      },
    ],
  },

  {
    title: 'KPIs',
    note: 'The handful of things each role is measured on, two per pillar.',
    answers: [
      {
        ask: 'How do I add a KPI?',
        also: ['new kpi', 'add measure', 'add criteria', 'what to measure'],
        say:
          'Two per pillar per role, which is twelve for the whole role and is deliberately not more. If you are adding '
          + 'the thirteenth, something else should come off.',
        go: { href: '/setup/kpis', label: 'KPIs per role' },
        press: 'Save',
      },
      {
        ask: 'How do I delete a KPI?',
        also: ['remove kpi', 'get rid of a measure', 'no delete button'],
        say:
          'Clear its text and save. There is no delete button — an empty row is how a KPI goes, which catches people '
          + 'out, so: empty the words, press save, it is gone. Months already marked against it keep their marks.',
        go: { href: '/setup/kpis', label: 'KPIs per role' },
        press: 'Save',
      },
      {
        ask: 'It says the weights must add up to 100%',
        also: ['weights', 'wont save kpis', '100%'],
        say:
          'Within each pillar, the KPIs have to share out 100% between them — otherwise a score cannot mean anything. '
          + 'The message names the pillar that does not add up. Nothing is saved until it does, so nothing is lost.',
        go: { href: '/setup/kpis', label: 'KPIs per role' },
      },
      {
        ask: 'What makes a good KPI?',
        also: ['how to write a kpi', 'good measure', 'examples'],
        say:
          'One you can answer at the end of a month without arguing: met, not met, or not applicable. "Improve safety" '
          + 'is not one. "Every crew did a toolbox talk on Monday" is. If two honest people would answer it '
          + 'differently, it needs rewording, not a better scoring system.',
        go: { href: '/setup/kpis', label: 'KPIs per role' },
      },
    ],
  },

  {
    title: 'Marking the month',
    note: 'The rhythm — marking, submitting, signing, and what happens after.',
    answers: [
      {
        ask: 'How do I mark the month?',
        also: ['score', 'scoring', 'enter results', 'do my scorecard'],
        say:
          'Go down your KPIs and say how each one went. You mark your own role and the ones beneath you — never above, '
          + 'never sideways.',
        go: { href: '/scoring', label: 'The month' },
        press: 'Save',
      },
      {
        ask: 'I marked something wrong — can I change it?',
        also: ['change a score', 'made a mistake', 'edit score'],
        say:
          'Yes, right up until the month is locked. Mark it again and save. Once a month is locked it stays locked: '
          + 'that is the point of locking it, and a record you can quietly edit afterwards is not a record.',
        go: { href: '/scoring', label: 'The month' },
        press: 'Save',
      },
      {
        ask: 'Nobody has marked anything and the month is nearly over',
        also: ['nobody scored', 'behind', 'no data', 'empty month'],
        say:
          'Mark it anyway, honestly, with what you know. A month marked roughly is worth more than a month left blank, '
          + 'because the blank one teaches the business that SPEC is optional. The second month is easier than the '
          + 'first and the third is easier again.',
        go: { href: '/scoring', label: 'The month' },
      },
      {
        ask: 'Everything is green and I do not believe it',
        also: ['all green', 'too generous', 'marking everyone well'],
        say:
          'Then it is being marked kindly rather than honestly, and that is the one thing that makes the whole thing '
          + 'worthless. A month with nothing amber in it is a month nobody looked at. The fix is not in SPEC — it is '
          + 'saying out loud, once, that amber is the normal colour of a working business.',
      },
      {
        ask: 'How do I close the month?',
        also: ['submit', 'sign off', 'finish the month', 'lock'],
        say:
          'Four steps, in order, and only whoever is at the top of the chart can do them: submit it, sign it, then lock '
          + 'it. Locking generates the board pack and opens the next month. Between submitting and signing you can '
          + 'still reopen it; after locking you cannot.',
        go: { href: '/scoring', label: 'The month' },
        press: 'Submit for sign-off',
      },
      {
        ask: 'I submitted it too early',
        also: ['reopen', 'undo submit', 'unlock'],
        say:
          'Reopen it — that works right up until it is signed and locked. After locking it is final, and the answer is '
          + 'a note against next month rather than a rewrite of last one.',
        go: { href: '/scoring', label: 'The month' },
        press: 'Reopen the month',
      },
      {
        ask: 'Something is waiting for me to approve',
        also: ['approvals', 'inbox', 'waiting on me'],
        say: 'Everything waiting on a decision from you is in one place, with what it is for.',
        go: { href: '/inbox', label: 'Approvals' },
      },
    ],
  },

  {
    title: 'Paying for it',
    note: 'Seats, cards, and what happens if a payment stops.',
    answers: [
      {
        ask: 'What does it cost?',
        also: ['price', 'how much', 'billing', 'free'],
        say:
          'The first seat is free, for good — one person can run a whole business in SPEC without paying anything. '
          + 'Seats are counted from the second, and only people you have actually invited count. A name on the chart '
          + 'with no login is free.',
        go: { href: '/pricing', label: 'What it costs' },
      },
      {
        ask: 'SPEC says read-only and will not save anything',
        also: ['cannot save', 'read only', 'locked out of changes', 'payment'],
        say:
          'The payment has stopped — an expired card, nearly always. Nothing has been deleted and nothing is lost; '
          + 'everything comes back the moment the card is sorted, including anything you tried to type while it was '
          + 'read-only. A one-person business is never locked, because it owes nothing.',
        go: { href: '/billing', label: 'Sort the payment' },
        press: 'Update card',
      },
      {
        ask: 'How do I change the card?',
        also: ['update card', 'billing details', 'invoice', 'receipt'],
        say: 'Through the Pricing page, which is where invoices and receipts live too.',
        go: { href: '/billing', label: 'Billing' },
        press: 'Billing',
      },
      {
        ask: 'If I stop paying, do I lose everything?',
        also: ['cancel', 'stop', 'delete my data', 'leaving'],
        say:
          'No. The business goes read-only — you can see all of it and change none of it — and it stays that way. '
          + 'Nothing is deleted because a card expired. If you genuinely want it gone, ask us and say so out loud; it '
          + 'is deliberately not a button.',
        go: { href: '/billing', label: 'Billing' },
      },
    ],
  },

  {
    title: 'Mirrors, and the improvement register',
    note: 'The artifacts your team runs projects through, and the running list of problems.',
    answers: [
      {
        ask: 'Something is wrong and I want it written down',
        also: ['log a problem', 'raise an issue', 'improvement', 'register'],
        say:
          'Type it on your page, in your own words, and it goes on the improvement register with an owner and a place '
          + 'to be signed off. Anybody with a login can log one — that is the point of it.',
        go: { href: '/my-page', label: 'My page' },
        press: 'Log it',
      },
      {
        ask: 'How do I make a mirror?',
        /* The old words are kept as ways in: somebody who learnt this as a board still finds it. */
        also: ['new mirror', 'create mirror', 'add a mirror', 'new board', 'create board', 'add a board'],
        say:
          'A mirror is a thing your team pins and argues over — a rate you are working out, a plan with an owner against '
          + 'each step. Anybody with a login can make one and anybody can comment.',
        go: { href: '/mirrors', label: 'Mirrors' },
        press: '+ New mirror',
      },
      {
        ask: 'A mirror says it is not live',
        also: ['not updating', 'live data', 'no numbers'],
        say:
          'It names which feed is not connected. SPEC will not call a mirror live while any of its inputs are missing, '
          + 'because "partly current" reads as "current" on the screen where somebody is about to change a price.',
        go: { href: '/connections', label: 'Connections' },
      },
      {
        ask: 'What is the difference between the Board and a mirror?',
        also: ['board confusing', 'governance', 'mirror'],
        say:
          'The Board is the governing group — its charter, its pack, its meeting. A mirror is an artifact a team makes '
          + 'and works through. They used to share the word "board", which is exactly why one of them was renamed.',
        go: { href: '/mirrors', label: 'Mirrors' },
      },
      {
        ask: 'I want to tell you SPEC should do something differently',
        also: ['feedback', 'suggestion', 'feature request', 'complain'],
        say:
          'There is a box for exactly that, and it is read by the people who build SPEC. If somebody has already asked '
          + 'for the same thing, SPEC tells you so and your saying it again pushes it up the list — which is how the '
          + 'thing most customers want gets built before the thing one customer asked loudest for.',
        go: { href: '/intake', label: 'What would you change?' },
        press: 'Send it',
      },
    ],
  },

  {
    title: 'Getting set up the first time',
    note: 'What to do on day one, and what can wait.',
    answers: [
      {
        ask: 'Where do I start?',
        also: ['first time', 'day one', 'new business', 'setup'],
        say:
          'Six steps, and SPEC works out which are done from your actual data rather than from ticked boxes — so you '
          + 'can leave and come back and it knows where you were. Do them in any order.',
        go: { href: '/setup', label: 'Setting up' },
      },
      {
        ask: 'This is going to take days',
        also: ['too much', 'overwhelming', 'how long', 'no time'],
        say:
          'The first useful month needs three things: the roles, two KPIs per pillar on the ones that matter, and the '
          + 'people in them. Everything else — the board, the charter, the systems — can wait, and SPEC will not block '
          + 'you on any of it.',
        go: { href: '/setup', label: 'Setting up' },
      },
      {
        ask: 'Do I have to connect my accounting or job system?',
        also: ['connections', 'integrations', 'simpro', 'xero', 'do i need'],
        say:
          'No. SPEC works entirely on numbers people type in, and that is a complete way to run it. Connecting systems '
          + 'means some numbers arrive by themselves instead — useful, never required, and not the thing to do first.',
        go: { href: '/connections', label: 'Connections' },
      },
      {
        ask: 'I was just looking around and want to keep what I built',
        also: ['look around', 'demo', 'trial', 'keep it'],
        say:
          'Sign up and the business you were looking at becomes yours — the chart, the marks, all of it. That is the '
          + 'whole point of the look-around: it is the house you then buy, not a showroom copy of it.',
        go: { href: '/signup', label: 'Set up your business' },
        press: 'Create my business',
      },
    ],
  },

  {
    title: 'When something looks wrong',
    note: 'Before you assume it is broken.',
    answers: [
      {
        ask: 'A page says something went wrong',
        also: ['error', 'broken', 'reference id', 'crash'],
        say:
          'That is our end, not yours, and it should be rare. Check whether SPEC is up, then tell us what you were '
          + 'doing. If a page gave you a reference number, send that — it points straight at what happened.',
        go: { href: '/status', label: 'Check whether SPEC is working' },
      },
      {
        ask: 'A number looks wrong',
        also: ['wrong score', 'maths', 'does not add up', 'calculation'],
        say:
          'Every score in SPEC shows its working — open the scorecard and you can see each KPI, its weight and what it '
          + 'contributed. Nine times in ten the working explains it. If it does not, tell us, and quote the month.',
        go: { href: '/me', label: 'My scorecard' },
      },
      {
        ask: 'My question is not here',
        also: ['contact', 'talk to someone', 'help', 'support', 'email'],
        say: 'Write to us and say what you were trying to do. A real person answers.',
      },
    ],
  },
];

/** Every answer, flat — for searching, and for the tests that walk all of them. */
export const allAnswers = (): Answer[] => HELP.flatMap(g => g.answers);

/**
 * Words that are in every answer and so tell us nothing about which one somebody wants.
 *
 * Without this, "the" matched all thirty-nine — a search returning everything has answered nobody,
 * and is arguably worse than returning nothing, because it looks like it worked. The length rule
 * alone cannot do it: "kpi" is three letters and is one of the most useful things anybody types.
 */
const NOISE = new Set([
  'the', 'and', 'for', 'you', 'your', 'are', 'can', 'how', 'what', 'why', 'who', 'was', 'this',
  'that', 'with', 'from', 'have', 'has', 'not', 'but', 'all', 'any', 'out', 'get', 'got', 'its',
  'our', 'about', 'when', 'where', 'does', 'did', 'will', 'would', 'should', 'there', 'their',
]);

/**
 * Find the answers matching what somebody typed.
 *
 * Deliberately generous otherwise: it matches on the question, the answer, and every other way of
 * asking, so "cant login" finds "I cannot sign in". Somebody searching help is already stuck, and a
 * search that returns nothing is the moment they give up and email.
 */
export function findAnswers(query: string): Answer[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !NOISE.has(w));
  if (!words.length) return [];
  const haystack = (a: Answer) => [a.ask, a.say, ...(a.also ?? [])].join(' ').toLowerCase();
  return allAnswers()
    .map(a => ({ a, hits: words.filter(w => haystack(a).includes(w)).length }))
    .filter(x => x.hits > 0)
    .sort((x, y) => y.hits - x.hits)
    .map(x => x.a);
}
