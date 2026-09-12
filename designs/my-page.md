# My Page

The screen the navigation links to and no `.dc.html` was ever exported for. The
specification lives as a published artifact rather than a Claude Design file:

<https://claude.ai/code/artifact/af9078ac-edbf-42eb-af1c-d8b443ac3bb5>

It is screen 5 of 15 in a walkthrough, each screen its own artifact, linked from
that page. Recorded here because an artifact is not in this repository and this
is the source of truth for what the screen has to be.

## What it is

The one page a person logs into to start the day. It is **different for every
role**, and it is the only screen anyone opens in the morning.

Not a summary of somewhere else — that distinction is load-bearing, and the
spec corrects an earlier rule to say so:

> The earlier rule said the home screen is answered and left, and that anyone
> living on it was a warning sign. That was wrong, and it was wrong because it
> assumed the page was a summary of somewhere else. It is not. It is the place,
> and living on it is the product working.

## Six sections, in this order

The order is the argument, not a layout preference.

1. **My KPIs** — the four pillars for the month in progress, no press needed.
   It is the question the whole product exists to answer.
2. **Where you sit** — your role, who you report to, who reports to you.
3. **What changed for you** — why they opened the app today rather than
   yesterday. Only things that moved, only inside what they may see, and only
   things they can act on.
4. **Mail and the tasks it created** — because someone is waiting. Mail that
   matches something already on your card, with the task it created under it.
5. **My week** — the meetings that are the rhythm, and whether they were held.
6. **Learning, in small pieces** — last, because by then the gap it answers is
   already on the screen above it.

**An ask bar sits at the top**, and every section can be asked a question in
plain words with the answer coming back in place. This replaces the separate
chat screen entirely: two screens both claiming to be where you start is the
most reliable way a product gets called confusing.

## What each section must never become

The wrong version of each, named up front — cheaper than discovering them in
month four.

| Section | Must never become | Why |
|---|---|---|
| My KPIs | a chart | Four colours and four numbers is the whole design. A graph is something to interpret before you know whether anything needs you. |
| What changed | an activity feed | It has to end. Longer than a minute and it is noise people learn to scroll past. |
| Mail and tasks | an inbox | Mail that floats free of the thing it is about makes SPEC another place to check. The test is that the list ends. |
| My week | a calendar | SPEC does not own anybody's diary. Four or five meetings that *are* the operating system, and whether they are being held. |
| My team | a directory | The people you are accountable for, with their state. Never a ranking — no leaderboard, no ordering by score, ever. |
| Learning | a course library | A library is a shelf people walk past. Training earns its place by answering the problem in front of them this week. |

## The rule that holds it together

Every section is a **real thing, not a preview of a real thing**, and every
section has **somewhere to travel**. KPIs open the board. Mail opens what it
concerns. A meeting opens the meeting. Your team opens the chart.

> The failure mode to watch for is a section that cannot be travelled from.
> That is decoration, and decoration is what turns a working page into a
> dashboard.

The constraint from the old "no home screen" rule survives in a tighter form:
**one page, one chart, and no third route to anything.**

## How it differs by role

Same six sections, same order, every time. What fills them is decided by what
the role owns and may see — never configured by hand. A technician gets the
same page as the GM with less in it, and no section is hidden from anybody.

| Role | What changed shows | My week holds | Travels to |
|---|---|---|---|
| GM | Teams moving between bands, meters below target, roles open too long, the month closing | Pulse with directs · COGS as chair · board meeting · month end | The whole chart · their own board |
| Manager | Own KPIs moving, team's unscored cards, a supervisor becoming certified | Pulse with supervisors · COGS as stream head | Their team's chart · their own board |
| Supervisor | Crew's pending KPIs, own KPIs moving, month end approaching | Pulse — crew huddle · one to one with their manager | Their crew · their own board |
| Team member | Their card being scored, a KPI changing, a note left on it | Their crew huddle, and whether it happened | Their own board only |

A person with nobody under them sees a stated reason, not an empty block:
*"Nobody reports to you — so you see your own card and nothing else. That is the
visibility rule working, not a permission missing."*

## Also on this page

**"This is bugging me"** — present here and on every screen. It is how a problem
gets into the system at all.

## The day it is built for

> I connect every system I need to SPEC. I log into one screen and it is the
> only one I open. I know my KPIs and where they are up to. My mail and the
> tasks it created are in front of me. I attend my Pulse, and my COGS if it is
> mine to attend. I see my training in small pieces, when it is relevant. I know
> my leader is signed off and manages me properly. And I love going to work.

The last sentence is the point and the rest is the mechanism. SPEC does not
deliver belonging; it removes the reasons it does not happen — not knowing what
good looks like, not knowing where you stand, being managed by somebody never
taught how, and finding out in December that the year did not go as you thought.

**The test for anything proposed for this page:** if it is not something a
person does on a Tuesday morning, it is not on this page.
