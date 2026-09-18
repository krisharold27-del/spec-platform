# Where the product does not look like the design

Kris, 18 September: *"why is the design so boring"*, then *"this is not at all like the design i
sent you"*, then *"why are you not following design properly?"*.

## How this list was made, and why there wasn't one before

Every previous check of design fidelity was a **text search**. `scripts/design-coverage.mjs`
extracts phrases from the `.dc.html` prototypes and greps `src/` for them. It can tell you whether
the words appear. It cannot see a card shape, a colour, a line weight, a layout or a column — so
four grey dots where the design draws four coloured letters was invisible to it, and it reported
**100%, complete**, for weeks.

This list was made by rendering each prototype and its built page in a browser at the same width,
with the same business loaded, and **looking at both**. Nothing here comes from reading HTML.

`scripts/sweep-designs.mjs` regenerates the pairs.

---

## The pattern, which is the same on every screen

Four faults account for most of it. They are worth naming because fixing them once per screen is
mechanical, and because they explain the word *boring* better than any individual difference does.

**1. No headline.** Every design screen opens with a small rust kicker (`PEOPLE · ONE STOP SHOP`)
above a two-line serif statement (`The HR system for people businesses`). Every built screen opens
with a small title and a one-line subtitle. The design announces what the screen is for; the product
labels it.

**2. The explaining block is at the top instead of the bottom.** Every design ends with three quiet
"before / after" cards. The product carries the same words — the coverage check made sure of that —
but on several screens hoists them to the TOP as a full-width callout, so the first thing on the
screen is a paragraph about the screen.

**3. One column where the design has two.** The designs put the work on the left and the context on
the right — what you are scoring beside where the month lands, who you have beside who is on leave.
The product stacks everything into one column, so the context is below the fold and nobody reads it
while they work.

**4. Tables and prose where the design has cards and numbers.** The design anchors a screen with big
figures (`14`, `13 / 14`, `100%`, `2`) and person cards with initials, pills and buttons on them.
The product renders the same data as a table with a paragraph under it.

Underneath all four is one habit: **whenever something might be unclear, a paragraph was added.**
A paragraph is the cheapest thing to add and the most boring thing to read, and enough of them turn
a dashboard into a manual.

---

## Screen by screen

### Org chart — DONE, 18 September

Fixed and shipped. Listed here because it is the worked example of the rest.

- ~~Four grey dots instead of four solid S P E C tiles coloured by score~~
- ~~2px flat connectors instead of 5px rails coloured by what they report~~
- ~~Square panel with a hairline grey border instead of the design's rounded, rust-edged card~~
- ~~"Team of 3" as a line of text instead of a count badge on the corner~~
- ~~145 lines of "What the colours mean" under the chart instead of one legend line above it~~

### My Page

- No person header — the design has an avatar, `Dane Whitmore · Operations Manager`, and
  `MONDAY 14 SEPTEMBER · YOUR SPEC SHEET FOR THE DAY`
- No persona chips (Operations Manager / Site Supervisor / Apprentice / BD Manager)
- **No Snap Score band.** The design gives it a full-width band with a ring; the product has a small
  grey chip inside another card
- **The four pillar cards are missing entirely until a month is marked.** On day one — which is the
  only day a new customer ever sees — the design's most recognisable element is not there
- One column instead of the design's two
- "Everywhere else in SPEC" is a large text directory the design does not have, because the design
  has a navigation bar (now built)

### Monthly scoring

- No kicker, no headline (`Close the month. Then nobody argues about it.`)
- **"What closing the month changes" is at the TOP as a wall.** The design has it at the bottom as
  three quiet cards
- One column. The design's right-hand column — *Where the month lands*, *Ace watch*, *Sign-off* — is
  the context you score against, and in the product it is below a very long left column
- **Each KPI row is far heavier than the design's.** The design: one compact card with the target,
  the number, a `Fed` or `Needs confirming` pill and a Confirm button. The product: target, result,
  a status dropdown, a reason box and a note — five controls, times eight KPIs
- *Where the month lands* is four small boxes; the design is four labelled bars with percentages
- *Ace watch* is a plain list at the bottom; the design is a green panel with a card per person and
  Jul / Aug / Sep chips

### People

- No kicker, no headline (`The HR system for people businesses`)
- **No stat cards.** The design leads with `PEOPLE 14`, `ROLES FILLED 13 / 14`, `CLEAR TO WORK 100%`,
  `REVIEWS DUE 2`
- The agent panel is plain text; the design is a green panel with chips of what it actually did
  ("Drafted the Yard Lead ad from its KPIs", "Screened 3 applicants against Clear to Work")
- **Everyone is a table.** The design is a card per person: initials avatar, a `Current` /
  `Onboarding` / `Ticket expiring` pill, started, leave owing, next review, and two buttons —
  *Open scorecard* and *Book the review*
- One column. *Leave and availability*, *Documents and obligations* and *Onboarding in progress*
  are the design's right-hand column and are stacked underneath instead
- Leave rows have no *Approve* button; onboarding has no progress bars

---

## Not yet examined

Rendered and waiting, in `scratchpad/sweep`: My Scorecard, Training, Weekly Meeting, Inbox,
Connections, Boards, Setup, Board Pack, Landing, Pricing, Admin, Group, Sectors.

They are listed here rather than left out so this document cannot be mistaken for a complete audit.
**Four of sixteen screens have been looked at.** The four faults above were identical on all four,
so they are likely to hold — but "likely" is not the same claim as "looked at", and confusing those
two is what produced this document.
