# The Rules — the scoring engine

> The fifteen screens show what a person sees. **This is what the code does
> underneath.** Written so it can be built without inferring anything from a
> picture.

<https://claude.ai/code/artifact/4aee63b5-44c5-427b-be33-b3fb2900578a>

Marked **settled, nothing open** — "a developer building from this page does not
need to ask a question or infer anything from a screenshot." So where this
document and the code disagree, this document wins.

## 0 · What the engine is for

**SPEC is designed for board function and oversight.** It does not invent a
reporting framework and ask a board to adopt it — it takes the four things every
board already reviews and gives each one a live source.

> The chart stops being a diagram of who reports to whom and becomes **the
> instrument the board reviews through**. Safety is not a slide; it is a colour
> on a named person's card, in a named part of the structure, with a date and an
> owner.

**Every business reports to a board, whether or not it has one** — a bank
holding a covenant, an owner who took the risk, an investor, a franchisor, a
major customer, a regulator, a family. The board layer is never optional and
never a tier. When there is genuinely nobody, the pack is addressed to the owner.

> The wrong version to avoid: a setup question that asks "do you have a board?"
> and hides half the product when the answer is no.

**What this obliges the engine to be:** every number resolves to a role, every
role to a person, every person to a chain, every chain back to a pillar. Any
rule that breaks that chain is the wrong rule.

## 1 · Visibility — the rule no setting can override

**A person's card is visible to that person, and to everyone above them in their
own chain. Nobody sideways. Nobody below.**

| Looking at | Can see | Why |
|---|---|---|
| Their own card | **Yes** | In full, including the arithmetic and the incentive working |
| Someone who reports to them | **Yes** | At any depth. They are accountable for it |
| Their own leader | **No** | Never. Not the score, not the colour, not the pillars |
| A peer at the same level | **No** | Never, including two supervisors under one manager |
| Anyone in another chain | **No** | Not above them, so not visible |
| A board role, looking down | **The GM only** | The pack, the chart, and the card reporting directly to them |
| A second leader on a dotted line | **No** | Only the chain on the chart counts |

Consequences, each a real constraint:

- **The chart shows structure to everyone, colour to almost nobody.** Anyone can
  see names, roles and reporting lines. Colours and percentages appear only on
  themselves and people beneath them. The chart is a map, not a scoreboard.
- **A team roll-up is its leader's number**, so the crew that makes it up cannot
  see it — it is one press from working out what a peer scored.
- **No leaderboard, no ranking, no comparison, ever.** Not by team, not by
  pillar, not anonymised. Each is sideways visibility with a friendlier name.
- **Notifications obey it.** If an email would reveal a score the recipient is
  not entitled to, it is not sent.
- **The agent obeys it absolutely.** "How is my manager tracking?" is *declined*
  — not softened, hedged or partially answered. A summary of a hidden number is
  the hidden number.
- **A deduction never names what caused it.**
- **The board pack is the one lawful exception**, and it reaches only board
  seats an administrator created, after the leader locked the month.
- **No exception by job function** — not HR, not finance, not an EA.

> A leader who can be scored in front of the people they lead will mark
> themselves green forever, and the moment that happens every number in the
> business becomes decoration.

And it is what makes My Page safe to give everybody: the **rule**, not the role,
decides what fills the six sections. There is no permission screen to get wrong.

## 2 · Statuses — seven words, three values

| Status | Means | Scores as | Set by |
|---|---|---|---|
| Confirmed | A non-negotiable that held | **Y** | Manual |
| Met | Target reached | **Y** | Either |
| On track | Inside target, ongoing measure | **Y** | Automatic |
| Watch | **Started, not finished** | **NA** | Manual |
| Not met | Target missed | **N** | Either |
| Pending | Not yet marked this period | **NA** | Default |
| Not tracked | No source, closed out this period | **NA** | Manual |

The vocabulary is fixed — a business cannot invent an eighth.

- **Watch is neutral, not a soft fail.** The outcome is genuinely not known yet.
- **Pending is never red.** Not measured yet is not doing badly.
- **The guard against abuse:** a KPI marked Watch for **two consecutive closed
  months** resolves to **Not met** on the second lock. Without that rule, Watch
  becomes the way a business never fails at anything.

## 3–5 · The arithmetic

```
pillar % = Σ weight of KPIs scoring Y  ÷  Σ weight of KPIs scoring Y or N  × 100
role %   = mean of the pillars that have a score        (unweighted)
team %   = mean of role % for every scored person in the team, including its head
```

Default weight is 1. **NA rows leave the calculation entirely** — they are
absences, not zeros. A pillar where every KPI is NA has no score and is left out
of the role mean. Rounded to one decimal, half up, **at display only**.

Safety does not outrank Earnings in the arithmetic, whatever a leader feels.

### Bands

| Band | Range |
|---|---|
| On track | **100%** |
| Watch | **50 – 99.9%** |
| Behind | **under 50%** |
| Pending | no score — never coloured good or bad |

## 6 · The 90 per cent rule

Qualifies when **every pillar** of the team roll-up is **≥ 90% for two
consecutive closed months**. Consecutive means closed months with no gap; a
month with no score **breaks** the run rather than pausing it.

## 7 · Incentive

Two steps: earn against your own ceiling, then lose some of it for failures
below you. The deduction applies to the adjusted figure, not the ceiling.

```
earned    = ceiling × role %
deduction = 5% × (pillars under 50% anywhere in their chain), capped at 25%
payable   = earned × (1 − deduction)
```

| Level | Ceiling |
|---|---|
| Director | **Not in the scheme** — sets the ceilings, signs the lock, does not draw from the pool they govern |
| General Manager | $4,000 |
| Manager | $2,000 |
| Supervisor | $1,000 |
| Specialist | $750 |
| Technician | $500 |
| Apprentice | $250 |

Each is half the last — that halving is what makes the ladder explainable in a
pay conversation. **Ceilings are defaults, not law.**

A failed pillar means **Behind — under 50%**. A pillar at 60% is a bad month,
not a failure, and does not deduct. Failures flow upward only: a leader is never
credited for a team doing well, only reduced for one doing badly.

**The rule of 8 does not apply to ceilings.** Every price SPEC *publishes*
reduces to 8; an incentive ceiling is not a published price.

### Sales Ace — the one thing that changes a ceiling

**Ceiling doubled, for as long as it is held.** Both halves must hold in the
same month, **three months running**:

- **The outcome** — the growth meter at or above target, no month carried by a
  single deal.
- **The behaviours** — every sales KPI on their own card met.

Lost by **two consecutive months** where either half fails. Deliberately
asymmetric: three to earn so nobody gets it on a fluke quarter, two to lose
because a standing that survives a bad quarter is not a standing.

Applies from the month earned, forward — never backdated. Only roles with a
growth meter and sales KPIs can hold it. The deduction still applies afterwards.
More than one person can hold it — **a standard, not a ranking**.

> Doubling is the only number large enough to be worth three months of doing the
> dull things on the bad weeks.

**Exposure must be shown to the director before switching it on.** One sales
manager and four specialists is $5,000/month at plain ceilings and
**$10,000/month if all hold it** — $120,000 a year. Self-funding, because nobody
holds it while the growth meter is under target, but the number has to be shown,
not discovered.

## 8 · Power meters

```
component % = Σ (key % × key weight)          weights within a component total 100
meter %     = Σ (component % × component share)   shares total 100
reading     = green if ≥ target · amber 60–89.9 · red below 60
```

Bands read on the meter percentage itself, not a fraction of the target. Default
target 90 — the same number as the team roll-up rule. A business can raise its
target; **the amber floor of 60 does not move**.

The meter reaches exactly one scorecard — its owner's — as a **single KPI under
Earnings**. The keys inside it never appear as separate KPIs on anyone's card.

## 9 · Periods and locking

**Monthly, in arrears. You close out August during September.**

Marking and locking happen in the following month, because that is when the P&L
lands. Closing a month on its own last day would force every business to guess
at its financial KPIs.

| Rule | Behaviour |
|---|---|
| A period is a calendar month | Opens automatically on the first. Not configurable |
| Closed in the following month | Nothing is guessed at to hit a date |
| Marks editable until locked | No record kept of the churn |
| Locking is a person's decision, not a date | **Lock what you know** — a KPI waiting on the P&L sits Pending and arrives later as an amendment |
| Locked months are immutable | A correction is an **amendment** — dated, attributed, shown alongside |
| A new period does not need the old one closed | **Nothing blocks on tidiness** |
| The next period reloads automatically | Same roles, KPIs and targets; all marks back to Pending |
| Scores exist per period, forever | **Never recalculated.** A past month keeps the target it was scored against |

### The closed month is the performance record

A locked month is a **dated, attributed monthly performance review** — twelve a
year, per person, automatically. Each shows what was expected, what happened,
and who marked it. **Nobody is ever scored on an expectation they could not see.**

**Comments — both sides.** No challenge process, no appeal form, no dispute
workflow. The person scored may comment on their own month; their leader may
comment too. Neither is required, neither needs the other's permission, neither
can remove the other's. A comment never changes the score. Editable before lock,
**permanent after** — including by an administrator. SPEC never asks "do you want
to respond to this?", because inviting a response manufactures a disagreement
that mostly was not there.

**Locking files the month to each person's performance record** — the score, the
working, and both comments. HR reads it *in SPEC*, under an access an
administrator granted explicitly. SPEC still sends nothing.

> The single most common failure in a formal employment process is a business
> that acted on a real problem and cannot show it was ever raised.

**The financial year** follows the region — July for AU/NZ, April for the UK,
January for the US and most others. Changeable by an administrator only. It
affects the year view, quarterly review and year-to-date figures; it affects
nothing about scoring, incentives or the 90% rule. **Never asked at signup.**

## 10 · Connections — by category, never by vendor

Job management · Financials · Safety · CRM · Payroll · **People/HR** ·
Recruitment · **Communications** · Other.

- **People/HR** supplies the org structure for import — names, titles, reporting
  lines. **Never KPIs, targets, salaries or review history.**
- **Payroll** also supplies the reporting line, as suggestions an administrator
  accepts, never applied.
- **Communications** supplies mail that matches something already on the
  person's card. Never an inbox, never a thread list, and **connected by the
  individual, not by an administrator**, because a mailbox belongs to a person.

**Zero connectors, every connector, or anything in between.** A business that
connects nothing gets the whole product. Manual is a complete, permanent mode.
Switching a connector off degrades gracefully — every KPI returns to the manual
toggle and no history is lost.

## 11 · What the system sends — six emails, and nothing else

No digests, no marketing, no re-engagement.

| Email | To whom | When |
|---|---|---|
| Take your seat | One named person | An administrator adds the seat. Single use, expiring, bound to that address |
| Sign in | The person signing in | They asked to |
| Your month is marked | The person scored | Once per person per month |
| Waiting on you | A manager with unmarked KPIs | Three days before month end. **Once. Never again** |
| Your board pack is ready | Board-role seats | **No attachment, no link, no content** — they sign in to read it |
| A connection stopped working | Whoever set it up | Nobody else is told |

## 12 · Seats and billing

**$26 a month per person who can sign in (AUD).** People on the chart without a
seat are free and still scored.

| Region | A seat | With training |
|---|---|---|
| Australia | AUD $26 | AUD $44 |
| New Zealand | NZD $35 | NZD $53 |
| United Kingdom | GBP £17 | GBP £26 |
| Europe | EUR €26 | EUR €44 |
| United States | USD $26 | USD $44 |
| Canada | CAD $35 | CAD $53 |

Every published price **reduces to 8**, decided rather than converted — a
converted price stops reducing to 8 the moment the rate moves.

- **Board roles are free.** Not a tier and it unlocks nothing. The guard against
  abuse is visibility, not a limit: board roles appear on the chart where
  everybody can see them.
- No minimum. One seat is a complete product. Zero seats is free.
- Seats bill pro-rata from the day taken.
- **A lapsed subscription goes read-only.** Nothing is deleted.
- **Export always works**, including while read-only.

## The rule about all of it

> Nothing above is visible to a customer. No screen shows a formula, a weight,
> or the word "algorithm". A leader sees a percentage and the rows behind it,
> and can always reach the rows — that is the whole explanation they are owed.
