# Screens pinned to the design, word for word

Kris, 16 September: *"make sure the landing page and my page are always perfect"*, and then *"yes add
the stricter guard for landing and my page"*.

Everywhere else in SPEC, the coverage check accepts a **reworded** match: the design says "What needs
me today", the product says "What needs you today", and that counts. That is the right standard for
twenty-two screens — the product is not a transcription of a prototype, and a check that forbade
every improvement would be edited out within a week.

It is the wrong standard for these two. The landing page is the first thing a stranger ever sees, and
My Page is the thing a customer opens every morning. On those, "close enough" is how a page drifts a
word at a time until it is nobody's design.

So a screen listed here is held to **exact wording**. A phrase that only matches loosely fails the
build, and the failure names the phrase.

---

## Pinned

### Screen: SPEC Landing
### Screen: SPEC My Page

---

## Allowed to differ

Each one is a line in a diff with a reason next to it. Anything not listed here has to be exact.

### `SPEC My Page` — Today's jobs

A block listing today's jobs pulled from a connected job-management system. SPEC has no job feed:
Connections carries the systems a business runs, and nothing reads a job list out of them yet. The
words exist nearby, which is why this reads as reworded rather than missing — but the block does not
exist, and putting the heading on the page with nothing under it would be worse than not having it.

### `SPEC My Page` — KPI reports from connected systems

The same gap from the other end: numbers arriving from a system rather than typed by a person. SPEC
Basic is defined as every number entered by hand, and the Advanced path feeds KPIs through
Connections — but the My Page block that lists those arrivals is not built.

### `SPEC My Page` — Report a hazard

A one-press action on the phone view. The mobile screen has it; My Page does not, and adding a button
here that opens the same flow would put a safety action two places, which is how one of them goes
stale and somebody presses the wrong one.

### `SPEC My Page` — Snap it in line

The heading beside the Snap Score. The product says **Snap Score — too early to read** until there is
enough history, which is a different and more honest sentence: the design's wording assumes a score
worth reading, and a business in its first month has not got one.

### `SPEC My Page` — Virtual GM Power Meter HACC Your Power

Not a phrase — two of the pill's four lines, glued together by how the check reads a
design screen. The corner instrument is one `<button>` in `SPEC My Page.dc.html`,
holding the label, a percentage behind an `sc-if`, and **HACC Your Power** as three
sibling elements; a button's whole text is read as one string, and `{{ }}` template
holes vanish, so "Virtual GM Power Meter" and "HACC Your Power" arrive concatenated
whether or not the percentage between them was ever going to render.

**HACC, not "Hack".** Kris, 22 September: *"its not hack - its HACC - Haness [Harness]
Anterior Cingulate Cortex - the key concept of the training and programs to improve
performance."* The design tool that produced this screen turned his acronym into a
pun it assumed was intentional. It was not — see the 19 September quote below, and
`src/components/power-meter.tsx`, which now carries the correct word.

`src/components/power-meter.tsx` carries both, word for word, unconditionally — see
`PowerMeter`, the pill's two label spans. What sits between them in the product is
not the reworded text of anything: it is JSX — a comment, a conditional score, class
names — the same kind of scaffolding the design's own `sc-if` is, just written in a
different language. A source-text scanner cannot see past either one, and asking the
product to butt the two labels up against each other with nothing between, in the
raw file, would mean deleting the comment explaining why the percentage is
conditional in the first place.

**Decided:** 20 September 2026.

### `SPEC My Page` — Everything else — 25% shared of met

The other half of the same button-merges-into-one-string artifact, on the row below.
`{{ gm.otherMet }} of {{ gm.otherTotal }} met {{ gm.otherArrow }}` is the design's
second line; strip its template holes and "of met" is what is left, glued onto
"Everything else — 25% shared" from the line above because both sit inside the same
`<button>`. `power-meter.tsx` carries "Everything else — 25% shared" as a literal
(`tests/power-meter.test.ts` holds it in sync with `SHARED_POINTS`) and carries the
count as `{reading.sharedMet} of {SHARED_SLOTS} met` — correct, and never going to
read as one contiguous string in source, because a real count sits where the design
left a hole. See `of met` in `designs/superseded.md` for the same fragment counted
on its own.

**Decided:** 20 September 2026.

### `SPEC My Page` — Validate in COGS — sign it off

A register entry's sign-off button, worded for a business that runs a COGS meeting. SPEC does not
assume a meeting is called that: the weekly meeting is named by the business, and hard-coding one
company's word for it into every customer's page is exactly the kind of thing the rest of this
product refuses to do.

### `SPEC My Page` — Sent · has it

The late-quotes block (26 September) says "Sent · Dana Ward has it" — the design's own sentence
with the customer's name in the hole it leaves for one (`{{ lq.who }}`). The check reads the design
with its holes taken out and the code as bare words, so a name filled in is always a loose match.
The wording is the design's; the name is the business's.

**Decided:** 26 September 2026.

### `SPEC Landing` — SPEC, AI included
### `SPEC Landing` — per leadership seat / team seat, a month

The design prices a with-AI tier on the front page. That tier has a rate but is not on sale
(`AI_TIER_ON_SALE` in `lib/plan`; CLAUDE.md: "not sellable yet"), and a price on the first page a
stranger sees for something they cannot buy is a promise the product would then have to break. The
seat prices that ARE on sale are shown, from `lib/pricing`. This line comes back, word for word,
the day the tier goes on sale.

**Decided:** 26 September 2026.

---

*Everything else on both screens is word for word, and the build fails if that stops being true.*
