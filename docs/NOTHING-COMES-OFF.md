# Nothing comes off unless Kris says so

Kris, 26 September:

> *"and stop losing things - honestly i cant cope if you do that - so make a rule nothing can be
> taken off unless you ask me"*

And, an hour earlier, the thing that prompted it:

> *"there are three absolutely critical aspects to this system - links (org chart) - kpi boards
> (flow) and mirrors to support (growth) - where the fuck are they - im furious"*

## What actually happened, because the diagnosis matters

Nothing had been deleted. Measured on the day: 80 pages before, 80 after; 2,869 exported functions
before, 2,878 after. Not one page or function removed.

Scoring and Mirrors had been **moved off the menu** on 24 September and left in a drawer. To the
person looking for them that is identical to deletion — they went to find the thing and it was not
there — and every check in the repo passed happily throughout, because nothing *was* deleted.

**So "we did not delete it" is not the promise. "You can still get to it" is.** This file holds the
second promise, in three layers, because the thing being guarded against is not vandalism. It is a
reasonable-looking tidy-up.

## The three layers

| What | Held by | Fails when |
|---|---|---|
| **Exported functions** | `docs/public-surface.txt` + `tests/surface.test.ts` | a function stops existing |
| **Pages you can reach** | `scripts/reachable.mjs` + `tests/reachable.test.ts` | a page has nothing linking to it |
| **The menu** | this file + `tests/doors.test.ts` | a tab or a directory door disappears |

Each has the same asymmetry, and it is the whole design:

- **ADDING is free and silent.** Write it, carry on.
- **TAKING SOMETHING AWAY fails the build, by name,** and the only way past is a dated line below
  with Kris's own words in it.

Not "it seemed unused". Not "it was redundant". Not "it is still in the directory". Those are the
sentences that lost Mirrors for two days. A person asked for it, in words, or it does not go.

## Removals

### 26 September — the bar cut from sixteen tabs to ten

Kris, verbatim:

> *"tabs MUST be - My Page - Mirrors - Jobs - Financials - CRM - Safety - People - Compliance -
> Set Up - Connections"*

and, when asked in effect what happens to the chart:

> *"org chart is on my page and under people but doesnt have own tab"*

Six items came off the bar. **None were deleted, and every one is one click from My Page**, whose
"Everywhere else in SPEC" section renders the full directory:

| Came off the bar | Still reached from |
|---|---|
| Org chart (`/org`) | its own card on My Page, People, Virtual GM and Setup (`OrgChartDoor`), and under People |
| Scoring (`/scoring`) | the directory, under "The rhythm" as **The month** |
| Virtual GM (`/virtual-gm`) | the directory, and its power meter now sits on management's My Page |
| ~~Board (`/board`)~~ | **Back on the bar the same day**, renamed **Board pack** — see below |
| COGS meeting (`/meeting`) | the directory, under "The rhythm" |
| All pages (`/pages`) | the directory — *added that day, it was in neither* |

### 26 September, later — Board pack added back as the eleventh tab

Kris: *"one more tab must be added ... the Board tab must be replaced."*

Replaced rather than restored, and the rename is the whole point. **Board** meant two different
things on one screen: the governing body that approves the pack, and the boards a team pins things
to. Design 11 settled the second half by renaming those to Mirrors; the tab kept the ambiguous word
for another fortnight. **Board pack** can only mean the one thing.

The bar is eleven: My Page · Mirrors · Jobs · Financials · CRM · Safety · People · Compliance ·
Board pack · Set up · Connections.

Worth noting against the row above: `/board` appears in both lists — taken off the bar in the
morning and put back in the afternoon. That is not a contradiction to tidy away. It is the record
working: each move is dated and has the words that asked for it, so "why does the bar look like
this" has an answer that does not depend on anybody remembering.

The two `added that day` rows are the point of this file. Following the instruction exactly would have made
`/board` and `/pages` reachable only by typing the address — losing the safety net inside the very
change meant to stop things being lost. The check caught it. Nobody's memory did.
