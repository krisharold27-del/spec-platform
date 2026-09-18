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

### One thing that made every earlier pair unreliable

Until 18 September the prototypes rendered here **in the wrong typeface**. Each one imports
Caprasimo from Google Fonts; this environment's proxy refuses that host; the import failed in
silence and the browser used Arial. So every "design versus product" picture was partly a comparison
of two different fonts — which is how the design's card titles came to look lighter than the
product's, and sent me hunting a weight problem that did not exist.

`scripts/design-fonts.mjs` now serves both faces to the prototypes as inlined files, and throws if
it cannot. Anything in this document dated before then was read off a picture in Arial.

**And a thing worth knowing before matching a screenshot exactly:** with the real face loading, the
design's own card titles are still a plain sans, because `SPEC Org Chart.dc.html` computes a
`titleStyle` — Caprasimo, sized by depth, two-line clamp — and never applies it to the element. The
product does what the file says. A prototype is code, and code has bugs.

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

Two passes. The first fixed the cards; Kris looked again — *"now fix all the rest especially org
chart"* — and the second fixed the screen around them.

First pass, the cards:

- ~~Four grey dots instead of four solid S P E C tiles coloured by score~~
- ~~2px flat connectors instead of 5px rails coloured by what they report~~
- ~~Square panel with a hairline grey border instead of the design's rounded, rust-edged card~~
- ~~"Team of 3" as a line of text instead of a count badge on the corner~~
- ~~145 lines of "What the colours mean" under the chart instead of one legend line above it~~

Second pass, the screen:

- ~~No kicker, no headline — the screen opened with a 24px title and a grey subtitle, then repeated
  the design's headline inside a callout box~~
- ~~Link / Flow / Grow as white cards with `MET` and `STEP 3` written in capitals, instead of the
  design's tinted cards with one dot~~
- ~~The chart loose on the page background, with no frame, no *Viewing:* line, no way to narrow to
  one branch, and no `9 roles · 0 off the chart · 0 all green`~~
- ~~**Neither of the two panels the design hangs off the chart existed.** No *Role scorecard* — so
  pressing a role did nothing — and no *What the board sees*, even though this page already
  calculates those four averages and threw them away~~
- ~~"Off the chart" as a separate card two scrolls below the thing it is about~~
- ~~The import panel permanently open at the foot of the page, so every visit to the chart ended in
  a wall of setup~~
- ~~Every card on a new business reading "Checklist role", because the four letters were gated on
  having KPIs already — the whole chart was grey and captioned on the first morning~~
- ~~A single click on a card navigated away, because the title was a link. The design's mapping is
  click to select, double-click to open~~

**Deliberately not built:** the prototype's slider that drags a pillar's score. A score in SPEC is
what the KPI results add up to; a control that sets one directly would make every number on the
board a matter of opinion.

### The mark — DONE, 18 September

- ~~Not animated at all.~~ Every design file opens with it playing: the ring runs red → amber →
  green over four and a half seconds, the hand sweeps round and lands on twelve, a crown arrives at
  the end. The product drew the last frame as a still, on a black disc where the design's is deep
  sage. **No text check could ever have found this**, which is why `scripts/mark-journey.mjs` asks
  the browser where the hand is instead.

### My Page

- No person header — the design has an avatar, `Dane Whitmore · Operations Manager`, and
  `MONDAY 14 SEPTEMBER · YOUR SPEC SHEET FOR THE DAY`
- No persona chips (Operations Manager / Site Supervisor / Apprentice / BD Manager)
- **No Snap Score band.** The design gives it a full-width band with a ring; the product has a small
  grey chip inside another card
- ~~**The four pillar cards are missing entirely until a month is marked.** On day one — which is the
  only day a new customer ever sees — the design's most recognisable element is not there~~
- ~~An unmarked pillar read as an em dash. Kris: *"i dont like the dashes they should 0's percent"*.
  Nought is the honest reading of a month nobody has scored, and the line under it still says "Not
  marked yet" so nought is never mistaken for a month that was marked and failed~~
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
