/**
 * SPEC's own training material for frontline leaders — the thing the A$44 seat actually buys.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────────
 *
 * Kris, 16 September 2026: *"we need to make training materials available for front line leaders and
 * so it need to be only $44 for people who are supervisors, team leaders etc"*.
 *
 * Before this, the A$44 was a number on three screens with nothing behind it. The training MACHINERY
 * already shipped to every business at A$26 — a curriculum per role, paths tied to pillars, progress
 * that belongs to the person, sign-off that belongs to the placement. What was missing was the
 * material: every business had to write its own modules, and most never would.
 *
 * ── What is in it, and what is deliberately not ──────────────────────────────────────────────────
 *
 * Every module is about leading the people in front of you, in the week you are actually having. Not
 * one of them is about the software. A supervisor who finishes this path should be better at the
 * job, not better at SPEC — and a training library that teaches its own buttons is a library that
 * exists to justify a price.
 *
 * Each is tied to a pillar, and through the pillar to KPIs the role is already scored on, so
 * finishing a path is meant to move a number somebody is accountable for. That is the same rule the
 * business's own modules follow (lib/training); SPEC's material earns no exemption from it.
 *
 * `core` marks the ones that are the job rather than an improvement on it. They come first.
 *
 * ── Ids are permanent ────────────────────────────────────────────────────────────────────────────
 *
 * A `libraryId` is written into every business that installs the library and into every record of
 * somebody's progress. Renaming one would orphan the learning of every person who has done it. The
 * title can be edited freely; the id cannot change, ever.
 */

export interface LibraryModule {
  /** Permanent. See the note above. */
  libraryId: string;
  title: string;
  summary: string;
  pillar: 'safety' | 'people' | 'earnings' | 'compliance' | 'all';
  minutes: number;
  /** The job itself, rather than an improvement on it. Core modules come first in the path. */
  core: boolean;
  /**
   * The material. Plain text: blank line between paragraphs, lines beginning "- " read as points.
   *
   * This is the part that makes the seat worth what it costs. A module with a title, a summary and
   * nothing inside it is a checklist item, and nobody should be charged A$18 a month extra for a
   * checklist. Written to be worked through in the minutes it says, by somebody who will read it on
   * a phone in a ute at seven in the morning.
   */
  content: string;
}

export const LIBRARY: LibraryModule[] = [
  // ── Safety ─────────────────────────────────────────────────────────────────────────────────────
  {
    libraryId: 'spec.safety.start-of-day',
    title: 'The first ten minutes on site',
    summary:
      'What a crew decides in the first ten minutes sets the whole day. Walking the area before the '
      + 'work starts, naming the two things that could hurt somebody today rather than reading a '
      + 'generic list, and giving the crew somewhere to put what they already noticed on the way in.',
    pillar: 'safety',
    minutes: 25,
    core: true,
    content: `The first ten minutes decide the day. Not the paperwork — what the crew watches you do before the work starts.

**Walk it before you talk it.** Get to the work area ahead of the crew and look at it yourself. You are looking for what changed since yesterday: another trade in the space, weather, a delivery in the wrong place, a floor opening that was covered on Friday.

**Name two things, not ten.** A list of ten hazards is a list nobody remembers. Pick the two that could actually hurt somebody today, on this job, and say what you want done about each.

- "The scaffold's been extended overnight, nobody goes above the second lift until I've checked the tags."
- "Sparkies are chasing walls in the next room — ears in from nine."

**Ask before you finish.** "What did you see on the way in?" is the highest-value question of the day and takes four seconds. The crew walked past things you did not.

**What good looks like**
- The two things you named are specific to today, and somebody could repeat them at smoko.
- At least one thing came from the crew rather than from you.
- Nobody was read a generic list.

**Where it shows up in your numbers**
Incidents and near misses sit under Safety on your scorecard. A start that names real hazards moves both — more near misses reported at first, which is the system working, then fewer incidents.

**Try this tomorrow**
Do the walk five minutes early. Write the two things on your hand if you have to. Do it every day for a fortnight before you judge it.`,
  },
  {
    libraryId: 'spec.safety.near-miss',
    title: 'Getting told about the near miss',
    summary:
      'Nobody reports a near miss to a supervisor who reacts badly to one. How to respond in the '
      + 'first thirty seconds, why "who did this" ends reporting for a year, and how to close the '
      + 'loop so the person who spoke up sees that it mattered.',
    pillar: 'safety',
    minutes: 30,
    core: true,
    content: `Nobody reports a near miss to a supervisor who reacts badly to one. Everything else in this module is downstream of that.

**The first thirty seconds are the whole thing.** What you say the moment somebody tells you decides whether they tell you again, and whether anybody else does.

Say: "Good. Glad you told me. Walk me through it."

Do not say: "Who did it?", "Why weren't you watching?", or — worst of the lot — nothing at all.

**Why "who" ends reporting for a year.** The moment the first question is about a person, everyone listening learns that reporting produces blame. They do not stop having near misses. They stop telling you.

**Separate the two questions.** "What happened" and "who is responsible" are different conversations on different days. Do the first one properly and the second one usually answers itself — and is usually about a process, a rush, or a decision made somewhere above the crew.

**Close the loop, visibly.** The person who spoke up has to see something change, or they have learned that it goes into a drawer.

- Tell them what you did, by name, within the week.
- Say it in front of the crew if you can do it without embarrassing them.
- If nothing can be done, say that too, and say why. "I asked, the answer was no, here is the reason" keeps more trust than silence.

**What good looks like**
- Reports go up in the first few months. That is the measure working, not the site getting worse.
- People bring you things that were nearly nothing.
- The crew can name something that changed because somebody spoke up.

**Where it shows up in your numbers**
Near misses reported is a leading indicator under Safety; incidents is a lagging one. Expect the first to rise before the second falls, and tell your manager that is what you expect, before it happens.`,
  },
  {
    libraryId: 'spec.safety.stop-the-job',
    title: 'Stopping a job, and surviving the conversation after',
    summary:
      'Every business says anyone can stop the job. Very few make it survivable. Making the call, '
      + 'what to say to the client standing next to you, and how to back a crew member who stopped '
      + 'something and turned out to be wrong — which is the day the policy is actually tested.',
    pillar: 'safety',
    minutes: 30,
    core: false,
    content: `Every business says anyone can stop the job. Very few make it survivable. The gap between the poster and the practice is where people get hurt.

**Making the call.** You do not need to be certain. You need to be unsure enough that continuing is a gamble with somebody's body. "I'm not comfortable, we're stopping until I've checked" is a complete sentence and needs no further justification in the moment.

**What to say to the client standing next to you.** Be factual, be brief, give them a next step. Do not apologise for stopping and do not argue the technical point on the spot.

- "We've stopped. There's something I need to check before my crew goes back in."
- "I'll have an answer for you within the hour."
- "If that pushes us past today I'll ring you myself."

**The day it is actually tested** is the day somebody stops work and turns out to have been wrong. What you do in the next five minutes sets the rule for everyone watching.

Back them, in public, without qualification: "You stopped because you weren't sure. That's exactly right. Turns out it was fine — stop it again next time."

If you add "but next time just check with me first", you have quietly withdrawn the permission and everyone heard it.

**Handle the cost separately.** Lost hours are real and they belong in a conversation with your manager about the job, not in a conversation with the person who stopped it.

**What good looks like**
- Somebody other than you has stopped a job in the last six months.
- The person who stopped it was not the last to find out what happened next.
- Your manager hears about the stop from you, first, with the reason.`,
  },

  // ── People ─────────────────────────────────────────────────────────────────────────────────────
  {
    libraryId: 'spec.people.first-conversation',
    title: 'The conversation you keep putting off',
    summary:
      'Lateness, phone use, a job done carelessly twice. How to raise it the first time it happens, '
      + 'in two minutes, standing up — before it becomes the six-month conversation that needs a '
      + 'witness and a form. What to say, and the three openings that guarantee a row.',
    pillar: 'people',
    minutes: 35,
    core: true,
    content: `The conversation you keep putting off gets more expensive every week you put it off.

**Do it at two minutes, not at six months.** Lateness three times, a phone out during a lift, a job done carelessly twice — raise it the first time, standing up, in under two minutes. Left alone it becomes a pattern, and a pattern needs a witness, a file note and an afternoon.

**The shape of it.** Four parts, in order, and none of them takes long.

- What you saw, factually. "You were twenty minutes late Tuesday and Wednesday."
- Why it matters here. "The crew can't start the isolation without you."
- A question, and then silence. "What's going on?"
- What happens now. "I need you here at seven. Can you do that?"

**The three openings that guarantee a row**
- "We need to have a chat." Said Friday, about Monday. They now have a weekend to build a case.
- "Everyone's been saying..." You have just made it the whole crew against them.
- "I'm not having a go, but..." You are. They know. Say the thing.

**The silence after the question is the work.** Most supervisors fill it within two seconds and talk themselves out of the conversation. Count to five in your head. People will tell you things in that gap — a sick parent, a car, a problem on the crew you did not know about — that change what should happen next.

**Write one line afterwards.** Date, what you said, what they said, what was agreed. Not a file note for a disciplinary process; a note so that in six weeks you know whether this is fixed or is a pattern.

**What good looks like**
- The conversation happened within a day or two of the thing.
- It took under five minutes.
- They know exactly what is meant to be different, and so do you.`,
  },
  {
    libraryId: 'spec.people.new-start',
    title: 'Somebody new, in their first week',
    summary:
      'Most people decide whether they are staying inside five days. What a supervisor controls in '
      + 'that week: who they stand next to, what they are allowed to do unsupervised, when somebody '
      + 'asks them how it is going, and what happens the first time they get something wrong.',
    pillar: 'people',
    minutes: 25,
    core: true,
    content: `Most people decide whether they are staying inside five days, and almost none of that is about pay.

**Who they stand next to is the biggest decision you make.** Not your best tradesperson — your best explainer. Somebody who narrates what they are doing and does not mind being asked the same thing twice. Tell that person explicitly that this is their job this week, and say how long for.

**Be honest about what they may do alone.** Write it down on day one: this yes, this with somebody, this not yet. Ambiguity here is how a new start either stands about doing nothing, or does something they should not have touched.

**Somebody asks how it is going, on day two and day four.** Two minutes, not a meeting. "How's it going? Anything that's made no sense?" Day two catches the practical stuff. Day four catches whether they are actually going to stay.

**The first time they get something wrong is the whole week in one moment.** The crew is watching how you handle it. Fix the work, keep it short, make the point about the method rather than the person, and finish the conversation properly rather than letting it trail off.

**What good looks like**
- By Friday they can name what they are allowed to do on their own.
- They have asked at least one question of somebody other than you.
- You know one thing about them that is not on their application.

**Where it shows up in your numbers**
Retention and time-to-productive sit under People. The cost of a start who leaves in month two is mostly spent in week one, before anybody notices anything is wrong.`,
  },
  {
    libraryId: 'spec.people.delegating',
    title: 'Giving work away without losing it',
    summary:
      'The supervisor who does the tricky bits themselves has a crew that never learns them and a '
      + 'week with no room in it. Choosing what to hand over, saying what "done" looks like before '
      + 'they start, and checking in a way that is not standing over somebody.',
    pillar: 'people',
    minutes: 30,
    core: false,
    content: `The supervisor who does all the tricky bits has a crew that never learns them and a week with no room in it. Both problems have the same fix and it feels worse before it feels better.

**Choose what to hand over on purpose.** Not the jobs you dislike — the jobs that are one step past what somebody can already do. Too easy and it teaches nothing; too far and you are setting them up.

**Say what done looks like before they start.** Most delegation fails here. "Sort out the switchboard" and "switchboard terminated, labelled and photographed before you knock off" are different instructions, and only one of them can be got wrong quietly.

- What finished looks like.
- When you need it by.
- What to do when they get stuck — and who to ask, by name.
- What they may decide themselves, and what comes back to you.

**Checking without standing over somebody.** Agree the check-in when you hand it over, not when you get anxious. "I'll come by after lunch" is a plan. Appearing every twenty minutes is supervision by hovering, and it teaches people to wait for you.

**When it comes back wrong.** Ask what they were working from before you correct anything. Half the time the instruction was the problem, and finding that out is worth more than the fix.

**What good looks like**
- Somebody on your crew can now do something they could not do a month ago.
- You were not interrupted about it four times.
- You can take a day off without a job stopping.`,
  },
  {
    libraryId: 'spec.people.scorecard-conversation',
    title: 'Talking to somebody about their month',
    summary:
      'A score is the start of a conversation, never the end of one. Opening with what the number '
      + 'does not know, separating "this went badly" from "you are doing badly", and agreeing one '
      + 'thing to change rather than five. The half-hour that decides whether scoring helps at all.',
    pillar: 'people',
    minutes: 40,
    core: true,
    content: `A score is the start of a conversation, never the end of one. Handled badly, monthly scoring makes a business worse than no scoring at all, because now the mistrust has a number on it.

**Open with what the number does not know.** Before anything else: "Here's what the score says. What does it not know about?" Weather, a client who changed their mind twice, two people off sick, a job that was quoted wrong before anybody swung a hammer. You are not softening it. You are getting the facts the measure could not see.

**Separate "this went badly" from "you are doing badly".** These sound similar and land completely differently.

- "Safety came in at 62 this month" is about a month.
- "Your safety is poor" is about a person, and everything after it is heard as an attack.

Stay on the first one. If it genuinely is about the person, that is a different conversation and it deserves its own one.

**Agree one thing, not five.** Five things is a list nobody starts. One thing, specific, with a date, that they choose where possible. Write it down in front of them.

**Say what you will do.** If the problem is a decision made above them, your half of the agreement is to take it up, and to come back with the answer either way. A supervisor who only ever assigns actions upward-facing is a post box, and everybody works out which one you are.

**Where the ceiling is.** Nobody can be scored above what the role can achieve given what it has been given. If the number is capped by something outside their control, say so out loud, in the conversation, and put it in the register rather than in their score.

**What good looks like**
- They talked more than you did.
- One thing is agreed, written, and has a date.
- They know what you are doing about the bit that is not theirs.
- Nobody was surprised by anything in the score.`,
  },

  // ── Earnings ───────────────────────────────────────────────────────────────────────────────────
  {
    libraryId: 'spec.earnings.where-the-hours-go',
    title: 'Where the hours actually go',
    summary:
      'Reading a week of your own crew\'s time honestly: travel, waiting on materials, rework, and '
      + 'the job that was quoted at two days by somebody who had not seen the site. What a '
      + 'supervisor can change this week, and what is somebody else\'s problem to fix.',
    pillar: 'earnings',
    minutes: 35,
    core: true,
    content: `You cannot fix a week you cannot see. This is about reading your own crew's time honestly, which is harder than it sounds because most of it looks like working.

**The four places hours disappear**
- Travel, including the second trip nobody counted.
- Waiting — on materials, on another trade, on a decision from the office.
- Rework, which almost never gets recorded as rework.
- Work that was quoted by somebody who had not seen the site.

**Take one real week and split it.** Not a typical week — last week. Hours against each of the four. Do it roughly; roughly is enough to see the shape and precisely is a project you will not finish.

**Then split that again: yours or somebody else's.** This is the part that matters.

- Yours: sequencing, the second trip, standing the crew down early instead of finding filler, the tool that lives in the wrong vehicle.
- Not yours: a quote that was wrong, a client who will not decide, a supplier who is a week out every time.

**Do the first list. Log the second.** Working harder on somebody else's problem is how supervisors burn out while the number does not move. The second list goes in the improvement register with the hours attached — a problem with a number on it gets fixed, and the same problem described as "the office is hopeless" does not.

**What good looks like**
- You can say where last week's hours went without guessing.
- One thing on your own list changed this week.
- One thing on the other list is logged with hours against it, and somebody senior has seen it.

**Where it shows up in your numbers**
Hours against estimate, and rework, both sit under Earnings. This is the single most direct thing a frontline leader does to the money.`,
  },
  {
    libraryId: 'spec.earnings.variations',
    title: 'The extra work nobody wrote down',
    summary:
      'The client asks for one more thing while you are there. Saying yes is good service and free '
      + 'work at the same time. How to capture it on the spot without becoming difficult to deal '
      + 'with, and why a variation raised three weeks later is usually a variation nobody pays.',
    pillar: 'earnings',
    minutes: 25,
    core: false,
    content: `The client asks for one more thing while you are there. Saying yes is good service and free work at the same time, and which one it turns out to be is decided in the next sixty seconds.

**Say yes and write it down in the same breath.** You are not being difficult. You are being the sort of contractor whose invoices never surprise anybody.

- "Yeah, we can do that. I'll note it as an extra so it's on the paperwork — should be about half a day."
- Then actually note it: date, who asked, what was asked, roughly how long.

**Why three weeks later is too late.** By then the client remembers a chat, not a change. Nobody has any way of settling it except goodwill, and goodwill gets spent on the thing that comes after this one.

**The two-minute rule.** If it takes under two minutes and costs nothing, do it and do not paper it. Goodwill is real and worth having. The mistake is letting that rule creep until half a day is being given away by habit.

**When you are not sure.** You do not have to price it on the spot, and you should not.

- "I'll get that priced and come back to you today."
- "Happy to start it now if you want it moving — I'll confirm the cost this afternoon."

**Tell your own office the same day.** A variation the supervisor knows about and the office does not is a variation nobody invoices.

**What good looks like**
- Every extra is written down on the day it is asked for.
- The client hears "yes, and here's what it is" rather than "I'll have to ask".
- Nothing on the final invoice is a surprise to anybody.`,
  },
  {
    libraryId: 'spec.earnings.rework',
    title: 'Doing it twice',
    summary:
      'Rework is the most expensive thing a crew does and the least likely to be recorded. Finding '
      + 'out what really caused it — a drawing, a rush, a gap in training, a decision made in the '
      + 'office — and raising it as a problem rather than absorbing it quietly.',
    pillar: 'earnings',
    minutes: 30,
    core: false,
    content: `Rework is the most expensive thing a crew does and the least likely to be written down anywhere, because recording it feels like confessing.

**Record it as rework.** If it goes onto the job as ordinary hours, nobody ever learns the job is bleeding. Two hours is two hours whatever you call it.

**Then find the actual cause, which is usually not carelessness.** Ask what they were working from. In order of how often it turns out to be true:

- The drawing or the instruction was wrong or out of date.
- It was rushed, because of a date somebody else set.
- Nobody had ever shown them that specific thing.
- A decision was made in the office without the person doing the work.
- Genuine carelessness.

The last one is the one everybody reaches for first, and it is the rarest.

**Raise it rather than absorbing it.** A supervisor who quietly eats rework is protecting their crew this week and guaranteeing the same loss every month after. Log it, with the hours and the cause, so the pattern is visible to somebody who can change the drawing or the quoting.

**Never make an example of somebody over rework.** Do it once and the next lot gets hidden, and hidden rework is the version that shows up in a client's hands instead of yours.

**What good looks like**
- Rework hours exist as a number, rather than as a feeling that the job went badly.
- The cause recorded is specific enough to act on.
- The same cause has not appeared three months running without anybody senior seeing it.`,
  },

  // ── Compliance ─────────────────────────────────────────────────────────────────────────────────
  {
    libraryId: 'spec.compliance.tickets',
    title: 'Tickets, licences and the day one expires',
    summary:
      'Who on your crew is allowed to do what, and what happens at seven in the morning when '
      + 'somebody\'s ticket ran out overnight. Checking before it matters, and the two-minute '
      + 'reshuffle that keeps the job running without anybody working outside their licence.',
    pillar: 'compliance',
    minutes: 20,
    core: true,
    content: `Compliance on a frontline crew comes down to two questions: who is allowed to do what, and what happens on the morning that changes.

**Know the expiries before the week starts.** Not the whole list — the ones inside ninety days. Five minutes on a Monday is the entire discipline.

**The morning one has run out.** You find out at seven. The job starts at seven-fifteen. What you do next:

- Do not let them do the work "just this once". There is no version of this that is worth it.
- Reshuffle: who else on site holds it, and what can that person swap onto?
- Tell the office immediately, so the renewal is being chased while you are working around it.
- Tell the person what they may do today, specifically, so they are not guessing.

**"Just this once" is the whole risk.** It is uninsured, it is usually illegal, and it is the thing that gets asked about first when anything goes wrong. It also tells the crew the rule is negotiable, which is much more expensive than one morning.

**Renewals are not the person's problem alone.** Most people who let a ticket lapse are not careless; nobody told them in time and the course was booked out. Ninety days' notice fixes nearly all of it.

**What good looks like**
- You can name everyone on your crew whose ticket expires in the next three months.
- Nobody has worked outside their licence, including for twenty minutes.
- A lapse causes a reshuffle, not an argument.`,
  },
  {
    libraryId: 'spec.compliance.paperwork-that-matters',
    title: 'Which paperwork is real',
    summary:
      'Some records protect the business and the crew; some exist because somebody once asked for '
      + 'them. Telling them apart, filling in the first kind properly and on the day, and raising '
      + 'the second kind as something to stop doing rather than resenting it for a year.',
    pillar: 'compliance',
    minutes: 25,
    core: false,
    content: `Some records protect the business and the crew. Some exist because somebody asked for them in 2014. Treating both the same is how a crew ends up resenting all of it.

**The test.** Ask of each form: if something went wrong, would this be the thing that showed we did it properly? If yes, it is real. If the honest answer is "nobody has ever looked at it", it is a candidate for stopping.

**The real ones get done on the day, properly.** Filled in afterwards from memory, in a batch, on a Friday, they are worse than nothing — they are a record that says something was checked when it was not, signed by somebody who now has their name on it.

**The other kind: raise it, don't resent it.** A form nobody reads is a process problem, and processes are what the improvement register is for. "We spend forty minutes a week on this and I can't find anyone who uses it" is a case. Quietly doing it badly for a year is not.

**Never pre-sign anything.** Not the start-of-day, not a check, not a sign-off. A signature against work that has not happened yet is the one that ends careers.

**What good looks like**
- Records that matter are completed on the day, by the person who did the work.
- You can say what each regular form is actually for.
- Anything you think is pointless has been logged as a question rather than done resentfully.`,
  },
];

/** The order a path is built in: the job itself first, then the rest, stable within each group. */
export function libraryOrder(modules: LibraryModule[] = LIBRARY): LibraryModule[] {
  return [...modules].sort((a, b) => (a.core === b.core ? 0 : a.core ? -1 : 1));
}

/** Total time to sit the whole path, for the sentence that tells somebody what they are taking on. */
export const libraryMinutes = (modules: LibraryModule[] = LIBRARY): number =>
  modules.reduce((t, m) => t + m.minutes, 0);

/** "Twelve modules, about five and a half hours, taken whenever suits." */
export function libraryLine(modules: LibraryModule[] = LIBRARY): string {
  const hours = libraryMinutes(modules) / 60;
  const rounded = Math.round(hours * 2) / 2;
  return `${modules.length} modules, about ${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hours in total, taken whenever suits.`;
}
